import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, PartyPopper } from "lucide-react";
import { TonConnectButton, useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import type {
  ManualSettlementStatus,
  SettlementAsset,
  SettlementDTO,
  SettlementStatus,
} from "@split-pay/shared";
import {
  Button,
  Card,
  EmptyState,
  ListRow,
  Screen,
  Section,
  Select,
  Spinner,
} from "../ui/index.js";
import {
  useAgreeSettlement,
  useConfirmDeposit,
  useConfirmManualSettlement,
  useCreateManualSettlement,
  useCreateSettlement,
  useGroupSummary,
  useRejectManualSettlement,
  useSaveWallet,
} from "../hooks/useGroup.js";
import { api } from "../lib/api.js";
import { displayName, formatCents } from "../lib/format.js";
import { getCurrentTelegramId } from "../lib/telegram.js";
import s from "./SettlePage.module.css";

const STEPS: { key: SettlementStatus; label: string }[] = [
  { key: "proposed", label: "Proposed" },
  { key: "agreed", label: "Agreed" },
  { key: "deployed", label: "Escrow" },
  { key: "released", label: "Paid" },
];

const MANUAL_LABEL: Record<ManualSettlementStatus, string> = {
  pending: "⏳ Awaiting confirmation",
  confirmed: "✅ Confirmed",
  rejected: "❌ Rejected",
};

function StatusStepper({ status }: { status: SettlementStatus }) {
  const idx = STEPS.findIndex((st) => st.key === status);
  return (
    <div className={s.stepper}>
      {STEPS.map((st, i) => {
        const done = i < idx || status === "released";
        const current = i === idx && status !== "released";
        return (
          <Fragment key={st.key}>
            {i > 0 && <div className={[s.connector, i <= idx && s.connectorDone].filter(Boolean).join(" ")} />}
            <div className={[s.step, done && s.done, current && s.current].filter(Boolean).join(" ")}>
              <div className={s.node}>{done ? <Check size={14} strokeWidth={3} /> : i + 1}</div>
              <span className={s.stepLabel}>{st.label}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

export function SettlePage({ groupId }: { groupId: string }) {
  const { data: summary, isLoading } = useGroupSummary(groupId);
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const saveWallet = useSaveWallet();
  const createSettlement = useCreateSettlement(groupId);
  const agree = useAgreeSettlement(groupId);
  const confirmDeposit = useConfirmDeposit(groupId);
  const createManual = useCreateManualSettlement(groupId);
  const confirmManual = useConfirmManualSettlement(groupId);
  const rejectManual = useRejectManualSettlement(groupId);
  const [asset, setAsset] = useState<SettlementAsset>("TON");
  const [busy, setBusy] = useState(false);
  const savedRef = useRef<string | null>(null);

  const activeId = summary?.activeSettlement?.id ?? null;
  // Poll the live settlement so agreements/deposits from others show up.
  const { data: live } = useQuery({
    queryKey: ["settlement", activeId],
    queryFn: () => api.getSettlement(activeId!),
    enabled: !!activeId,
    refetchInterval: 4000,
    initialData: summary?.activeSettlement ?? undefined,
  });

  // Persist the connected wallet so creditors have a receive address.
  useEffect(() => {
    if (tonAddress && savedRef.current !== tonAddress) {
      savedRef.current = tonAddress;
      saveWallet.mutate(tonAddress);
    }
  }, [tonAddress, saveWallet]);

  if (isLoading) return <Screen eyebrow="On-chain" title="Settle"><Spinner /></Screen>;
  if (!summary) return null;

  const settlement: SettlementDTO | null = live ?? summary.activeSettlement;
  const money = (c: number, cur: string) => `${formatCents(c, cur)} ${cur}`;
  const myTgId = getCurrentTelegramId();
  const me = summary.group.members.find((m) => m.telegramId === myTgId);

  const walletSection = (
    <Section label="Your TON wallet" footer="Connect so you can pay and receive on-chain.">
      <Card>
        <div className={s.tonWrap}>
          <TonConnectButton />
        </div>
      </Card>
    </Section>
  );

  // ── Manual (off-app) settle-ups: pay someone directly + confirmations ──────
  const iOwe = me ? summary.suggestions.filter((t) => t.from.id === me.id) : [];
  const manualSection = (
    <>
      {iOwe.length > 0 && (
        <Section label="Paid someone back?" footer="Records it off-app and asks them to confirm.">
          <Card pad="sm">
            {iOwe.map((t) => (
              <ListRow
                key={t.to.id}
                title={
                  <span>
                    You paid <strong>{displayName(t.to)}</strong>
                  </span>
                }
                after={
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={createManual.isPending}
                    onClick={() =>
                      createManual.mutate({ groupId, toUserId: t.to.id, amountCents: t.amountCents })
                    }
                  >
                    I paid {money(t.amountCents, summary.currency)}
                  </Button>
                }
              />
            ))}
          </Card>
        </Section>
      )}

      {summary.manualSettlements.length > 0 && (
        <Section label="Settle-ups" footer="Off-app payments the recipient confirms.">
          <Card pad="sm">
            {summary.manualSettlements.map((ms) => {
              const iAmRecipient = !!me && ms.to.id === me.id;
              return (
                <ListRow
                  key={ms.id}
                  multiline
                  title={
                    <div className={s.transfer}>
                      <div className={s.tParty}>
                        <span className={s.tName}>{displayName(ms.from)}</span>
                        <span className={s.tRole}>paid</span>
                      </div>
                      <span className={s.tArrow}>
                        <ArrowRight size={16} />
                      </span>
                      <div className={s.tParty}>
                        <span className={s.tName}>{displayName(ms.to)}</span>
                        <span className={s.tRole}>received</span>
                      </div>
                    </div>
                  }
                  subtitle={MANUAL_LABEL[ms.status]}
                  after={
                    ms.status === "pending" && iAmRecipient ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button
                          size="sm"
                          loading={confirmManual.isPending}
                          onClick={() => confirmManual.mutate(ms.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={rejectManual.isPending}
                          onClick={() => rejectManual.mutate(ms.id)}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className={s.tAmount}>{money(ms.amountCents, ms.currency)}</span>
                    )
                  }
                />
              );
            })}
          </Card>
        </Section>
      )}
    </>
  );

  // ── No open settlement: offer to start one ────────────────────────────────
  if (!settlement) {
    if (summary.suggestions.length === 0) {
      return (
        <Screen eyebrow="On-chain" title="Settle">
          <EmptyState icon={<PartyPopper size={30} />} title="Nothing to settle">
            Every balance is zero. You're all square.
          </EmptyState>
          {manualSection}
        </Screen>
      );
    }
    return (
      <Screen eyebrow="On-chain" title="Settle">
        {walletSection}
        {manualSection}
        <Section
          label="Start a settlement"
          footer="Snapshots the current graph, then everyone involved agrees."
        >
          <Card>
            <Select label="Pay with" value={asset} onChange={(e) => setAsset(e.target.value as SettlementAsset)}>
              <option value="TON">TON</option>
              <option value="USDT">USDT</option>
            </Select>
          </Card>
          <Card pad="sm">
            {summary.suggestions.map((t, i) => (
              <ListRow
                key={i}
                title={
                  <div className={s.transfer}>
                    <div className={s.tParty}>
                      <span className={s.tName}>{displayName(t.from)}</span>
                      <span className={s.tRole}>pays</span>
                    </div>
                    <span className={s.tArrow}>
                      <ArrowRight size={16} />
                    </span>
                    <div className={s.tParty}>
                      <span className={s.tName}>{displayName(t.to)}</span>
                      <span className={s.tRole}>receives</span>
                    </div>
                  </div>
                }
                after={<span className={s.tAmount}>{money(t.amountCents, summary.currency)}</span>}
              />
            ))}
          </Card>
          <Button
            stretched
            loading={createSettlement.isPending}
            onClick={() => createSettlement.mutate({ groupId, asset })}
          >
            Propose settlement
          </Button>
        </Section>
      </Screen>
    );
  }

  // ── Open settlement ───────────────────────────────────────────────────────
  const agreed = new Set(settlement.agreedUserIds);
  const myTransfer = me ? settlement.transfers.find((t) => t.from.id === me.id) : undefined;
  const iAmInvolved = !!me && settlement.involved.some((u) => u.id === me.id);
  const iAgreed = !!me && agreed.has(me.id);

  async function pay() {
    if (!settlement) return;
    setBusy(true);
    try {
      const dep = await api.getDeposit(settlement.id);
      if (dep && tonAddress) {
        try {
          await tonConnectUI.sendTransaction({
            validUntil: Math.floor(Date.now() / 1000) + 600,
            messages: [{ address: dep.address, amount: dep.amountNano }],
          });
        } catch {
          // user cancelled or sim address rejected — fall through to confirm
        }
      }
      if (!dep || dep.address.startsWith("EQsim_")) {
        await confirmDeposit.mutateAsync(settlement.id);
      }
    } finally {
      setBusy(false);
    }
  }

  const statusText: Record<SettlementStatus, string> = {
    proposed: "Waiting for everyone to tap Done",
    agreed: "Everyone agreed — deploying escrow…",
    deployed: "Escrow live — debtors can pay",
    released: "Settled on-chain 🎉",
    cancelled: "Settlement cancelled",
  };

  return (
    <Screen eyebrow="On-chain" title="Settle">
      <Card glow={settlement.status === "released" ? "success" : "purple"}>
        {settlement.status !== "cancelled" && <StatusStepper status={settlement.status} />}
        <div className={`${s.statusText} ${settlement.status === "cancelled" ? s.cancelled : ""}`}>
          {statusText[settlement.status]}
        </div>
      </Card>

      {settlement.status === "released" && (
        <div className={s.celebrate}>All debts cleared on TON 🎉</div>
      )}

      {manualSection}
      {walletSection}

      <Section label={`Transfers · ${settlement.asset}`}>
        <Card pad="sm">
          {settlement.transfers.map((t) => (
            <ListRow
              key={t.id}
              title={
                <div className={s.transfer}>
                  <div className={s.tParty}>
                    <span className={s.tName}>{displayName(t.from)}</span>
                    <span className={s.tRole}>pays</span>
                  </div>
                  <span className={s.tArrow}>
                    <ArrowRight size={16} />
                  </span>
                  <div className={s.tParty}>
                    <span className={s.tName}>{displayName(t.to)}</span>
                    <span className={s.tRole}>receives</span>
                  </div>
                </div>
              }
              after={
                <span className={`${s.tAmount} ${t.paid ? s.tPaid : ""}`}>
                  {t.paid && "✓ "}
                  {money(t.amountCents, settlement.asset)}
                </span>
              }
            />
          ))}
        </Card>
      </Section>

      <Section label="Agreements" footer="Only people in this settlement need to tap Done.">
        <Card pad="sm">
          {settlement.involved.map((u) => {
            const ok = agreed.has(u.id);
            return (
              <div key={u.id} className={s.agree}>
                <span className={[s.tick, ok && s.tickOn].filter(Boolean).join(" ")}>
                  <Check size={15} strokeWidth={3} />
                </span>
                <span className={s.agreeName}>{displayName(u)}</span>
                <span className={s.waiting}>{ok ? "Done" : "Waiting"}</span>
              </div>
            );
          })}
        </Card>
      </Section>

      {settlement.contractAddress && (
        <Section label="Escrow contract">
          <Card>
            <div className={s.addr}>{settlement.contractAddress}</div>
          </Card>
        </Section>
      )}

      <div className={s.actions}>
        {settlement.status === "proposed" && iAmInvolved && !iAgreed && (
          <Button stretched loading={agree.isPending} onClick={() => agree.mutate(settlement.id)}>
            <Check size={18} /> Done — I agree
          </Button>
        )}
        {settlement.status === "proposed" && iAgreed && (
          <div className={s.note}>You're in. Waiting for the others…</div>
        )}
        {settlement.status === "deployed" && myTransfer && !myTransfer.paid && (
          <Button stretched loading={busy} onClick={pay}>
            Pay {money(myTransfer.amountCents, settlement.asset)}
          </Button>
        )}
        {settlement.status === "deployed" && myTransfer?.paid && (
          <div className={s.note}>✅ You've paid. Thanks!</div>
        )}
        {!iAmInvolved && settlement.status === "proposed" && (
          <div className={s.note}>You're not part of this settlement.</div>
        )}
      </div>
    </Screen>
  );
}
