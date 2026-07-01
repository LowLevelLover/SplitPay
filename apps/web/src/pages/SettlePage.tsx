import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banner,
  Button,
  Cell,
  List,
  Placeholder,
  Section,
  Select,
  Spinner,
} from "@telegram-apps/telegram-ui";
import { TonConnectButton, useTonAddress, useTonConnectUI } from "@tonconnect/ui-react";
import type { SettlementAsset, SettlementDTO } from "@split-pay/shared";
import {
  useAgreeSettlement,
  useConfirmDeposit,
  useCreateSettlement,
  useGroupSummary,
  useSaveWallet,
} from "../hooks/useGroup.js";
import { api } from "../lib/api.js";
import { displayName, formatCents } from "../lib/format.js";
import { getCurrentTelegramId } from "../lib/telegram.js";

export function SettlePage({ groupId }: { groupId: string }) {
  const { data: summary, isLoading } = useGroupSummary(groupId);
  const tonAddress = useTonAddress();
  const [tonConnectUI] = useTonConnectUI();
  const saveWallet = useSaveWallet();
  const createSettlement = useCreateSettlement(groupId);
  const agree = useAgreeSettlement(groupId);
  const confirmDeposit = useConfirmDeposit(groupId);
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

  if (isLoading) return <Spinner size="l" />;
  if (!summary) return null;

  const settlement: SettlementDTO | null = live ?? summary.activeSettlement;
  const myTgId = getCurrentTelegramId();
  const me = summary.group.members.find((m) => m.telegramId === myTgId);

  const walletSection = (
    <Section header="Your TON wallet" footer="Connect so you can pay and receive on-chain.">
      <div style={{ padding: 12 }}>
        <TonConnectButton />
      </div>
    </Section>
  );

  // ── No open settlement: offer to start one ────────────────────────────────
  if (!settlement) {
    if (summary.suggestions.length === 0) {
      return <Placeholder header="Nothing to settle" description="All balances are zero. 🎉" />;
    }
    return (
      <List>
        {walletSection}
        <Section header="Start a settlement" footer="Snapshots the current graph, then everyone involved agrees.">
          <Select header="Pay with" value={asset} onChange={(e) => setAsset(e.target.value as SettlementAsset)}>
            <option value="TON">TON</option>
            <option value="USDT">USDT</option>
          </Select>
          {summary.suggestions.map((s, i) => (
            <Cell key={i} subtitle={`to ${displayName(s.to)}`} after={`${formatCents(s.amountCents, asset)} ${asset}`}>
              {displayName(s.from)}
            </Cell>
          ))}
          <div style={{ padding: 16 }}>
            <Button stretched size="l" loading={createSettlement.isPending} onClick={() => createSettlement.mutate({ groupId, asset })}>
              Propose settlement
            </Button>
          </div>
        </Section>
      </List>
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
      await confirmDeposit.mutateAsync(settlement.id);
    } finally {
      setBusy(false);
    }
  }

  const statusText: Record<SettlementDTO["status"], string> = {
    proposed: "Waiting for everyone to tap Done",
    agreed: "Everyone agreed — deploying escrow…",
    deployed: "Escrow live — debtors can pay",
    released: "Settled on-chain 🎉",
    cancelled: "Cancelled",
  };

  return (
    <List>
      <Banner header={`Settlement · ${settlement.asset}`} subheader={statusText[settlement.status]} />

      {walletSection}

      <Section header="Transfers">
        {settlement.transfers.map((t) => (
          <Cell
            key={t.id}
            subtitle={`to ${displayName(t.to)}`}
            after={`${t.paid ? "✅ " : ""}${formatCents(t.amountCents, settlement.asset)} ${settlement.asset}`}
          >
            {displayName(t.from)}
          </Cell>
        ))}
      </Section>

      <Section header="Agreements" footer="Only people in this settlement need to tap Done.">
        {settlement.involved.map((u) => (
          <Cell key={u.id} after={agreed.has(u.id) ? "✅ Done" : "…"}>
            {displayName(u)}
          </Cell>
        ))}
      </Section>

      {settlement.contractAddress && (
        <Section header="Escrow contract">
          <Cell multiline subtitle={settlement.contractAddress}>
            Address
          </Cell>
        </Section>
      )}

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {settlement.status === "proposed" && iAmInvolved && !iAgreed && (
          <Button stretched size="l" loading={agree.isPending} onClick={() => agree.mutate(settlement.id)}>
            ✅ Done — I agree
          </Button>
        )}
        {settlement.status === "proposed" && iAgreed && (
          <Cell>You're in. Waiting for the others…</Cell>
        )}
        {settlement.status === "deployed" && myTransfer && !myTransfer.paid && (
          <Button stretched size="l" loading={busy} onClick={pay}>
            Pay {formatCents(myTransfer.amountCents, settlement.asset)} {settlement.asset}
          </Button>
        )}
        {settlement.status === "deployed" && myTransfer?.paid && <Cell>✅ You've paid. Thanks!</Cell>}
        {settlement.status === "released" && <Cell>🎉 All settled on-chain.</Cell>}
        {!iAmInvolved && settlement.status === "proposed" && (
          <Cell>You're not part of this settlement.</Cell>
        )}
      </div>
    </List>
  );
}
