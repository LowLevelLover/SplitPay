import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, ExternalLink, PartyPopper, Wallet } from "lucide-react";
import type {
  ManualSettlementStatus,
  SettlementAsset,
  SettlementDTO,
  SettlementStatus,
  UserDTO,
} from "@split-pay/shared";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  ListRow,
  ProgressBar,
  Screen,
  Section,
  SegmentedControl,
  Select,
  Spinner,
} from "../ui/index.js";
import {
  useAgreeSettlement,
  useConfirmDeposit,
  useConfirmManualSettlement,
  useCreateManualSettlement,
  useCreateSettlement,
  useEscrowStatus,
  useGroupSummary,
  useRejectManualSettlement,
  useSaveWallet,
  useWallet,
} from "../hooks/useGroup.js";
import { api } from "../lib/api.js";
import type { DepositInstruction } from "../lib/api.js";
import { displayName, formatCents, formatTon } from "../lib/format.js";
import { getSession } from "../lib/session.js";
import { useI18n } from "../i18n/index.js";
import s from "./SettlePage.module.css";

const STEPS = ["proposed", "agreed", "deployed", "released"] as const;

function StatusStepper({ status }: { status: SettlementStatus }) {
  const { t } = useI18n();
  const idx = STEPS.findIndex((st) => st === status);
  return (
    <div className={s.stepper}>
      {STEPS.map((st, i) => {
        const done = i < idx || status === "released";
        const current = i === idx && status !== "released";
        return (
          <Fragment key={st}>
            {i > 0 && <div className={[s.connector, i <= idx && s.connectorDone].filter(Boolean).join(" ")} />}
            <div className={[s.step, done && s.done, current && s.current].filter(Boolean).join(" ")}>
              <div className={s.node}>{done ? <Check size={14} strokeWidth={3} /> : i + 1}</div>
              <span className={s.stepLabel}>{t(`settle.step.${st}`)}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** A monospace value with a copy button. */
function Copyable({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className={s.copyRow}>
      <div className={s.copyField}>
        <span className={s.copyLabel}>{label}</span>
        <span className={s.copyValue}>{value}</span>
      </div>
      <button type="button" className={s.copyBtn} onClick={copy} aria-label={t("common.copy")}>
        {copied ? <Check size={15} strokeWidth={3} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

/** Saved TON address with an edit/save affordance; used to pay and receive. */
function WalletCard() {
  const { t } = useI18n();
  const { data: wallet } = useWallet();
  const saveWallet = useSaveWallet();
  const saved = wallet?.tonAddress ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) setEditing(true);
  }, [saved]);

  const submit = async () => {
    const addr = value.trim();
    if (addr.length < 40) {
      setError(t("wallet.invalid"));
      return;
    }
    setError(null);
    try {
      await saveWallet.mutateAsync(addr);
      setEditing(false);
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("wallet.invalid"));
    }
  };

  return (
    <Section label={t("wallet.section")} footer={t("wallet.footer")}>
      <Card>
        {!editing && saved ? (
          <div className={s.walletSaved}>
            <span className={s.walletIcon}>
              <Wallet size={16} />
            </span>
            <div className={s.walletMain}>
              <span className={s.walletLabel}>{t("wallet.saved")}</span>
              <span className={s.addr}>{saved}</span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setValue(saved); setEditing(true); }}>
              {t("wallet.edit")}
            </Button>
          </div>
        ) : (
          <div className={s.walletEdit}>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("wallet.placeholder")}
              className={s.monoInput}
              spellCheck={false}
              autoCapitalize="none"
            />
            {error && <span className={s.walletError}>{error}</span>}
            <div className={s.walletActions}>
              {saved && (
                <Button size="sm" variant="secondary" onClick={() => { setEditing(false); setError(null); }}>
                  {t("wallet.cancel")}
                </Button>
              )}
              <Button size="sm" loading={saveWallet.isPending} onClick={submit}>
                {t("wallet.save")}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </Section>
  );
}

/** Deposit instruction + escrow funding status for a deployed settlement. */
function EscrowPanel({ settlement, amPayer }: { settlement: SettlementDTO; amPayer: boolean }) {
  const { t, locale } = useI18n();
  const confirmDeposit = useConfirmDeposit(settlement.groupId);
  const { data: status } = useEscrowStatus(settlement.id, settlement.status === "deployed" || settlement.status === "released");
  const [deposit, setDeposit] = useState<DepositInstruction | null>(null);

  useEffect(() => {
    if (amPayer && settlement.status === "deployed") {
      api.getDeposit(settlement.id).then(setDeposit).catch(() => setDeposit(null));
    }
  }, [amPayer, settlement.id, settlement.status]);

  const isSim = status?.network === "sim";
  // The deposit comment is the transfer id (see ton depositFor).
  const myTransfer = deposit && settlement.transfers.find((tr) => tr.id === deposit.comment);
  const alreadyPaid = myTransfer?.paid ?? false;

  const funded = status ? Number(status.balanceNano) : 0;
  const required = status ? Number(status.requiredNano) : 0;
  const progress = required > 0 ? funded / required : 0;

  return (
    <>
      {status && (
        <Section label={t("escrow.section")}>
          <Card glow={status.released ? "success" : "purple"}>
            <div className={s.escrowHead}>
              <Badge color={isSim ? "var(--purple)" : "var(--cyan)"}>
                {t(`escrow.network.${status.network}`)}
              </Badge>
              {status.explorerUrl && (
                <a className={s.explorer} href={status.explorerUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={13} /> {t("escrow.explorer")}
                </a>
              )}
            </div>
            {status.address && (
              <div className={s.addr} style={{ marginBlock: "var(--s-2)" }}>{status.address}</div>
            )}
            {!status.deployed ? (
              <div className={s.note}>{t("escrow.notDeployed")}</div>
            ) : (
              <>
                <div className={s.fundingLabel}>
                  <span>{t("escrow.funding")}</span>
                  <span className={s.tAmount}>
                    {t("escrow.of", {
                      balance: formatTon(String(funded), locale),
                      required: formatTon(String(required), locale),
                    })}
                  </span>
                </div>
                <ProgressBar value={progress} color={status.released ? "var(--success)" : "var(--cyan)"} />
              </>
            )}
            {status.released && <div className={s.celebrate} style={{ marginTop: "var(--s-3)" }}>{t("escrow.released")}</div>}
          </Card>
        </Section>
      )}

      {amPayer && settlement.status === "deployed" && deposit && !alreadyPaid && (
        <Section label={t("deposit.section")} footer={t("deposit.footer")}>
          <Card>
            <Copyable label={t("deposit.address")} value={deposit.address} />
            <Copyable label={t("deposit.amount")} value={formatTon(deposit.amountNano, locale)} />
            <Copyable label={t("deposit.comment")} value={deposit.comment} />
            <div className={s.depositActions}>
              {isSim ? (
                <Button
                  stretched
                  loading={confirmDeposit.isPending}
                  onClick={() => confirmDeposit.mutate(settlement.id)}
                >
                  {t("deposit.simConfirm")}
                </Button>
              ) : (
                <a
                  className={s.payLink}
                  href={`ton://transfer/${deposit.address}?amount=${deposit.amountNano}&text=${encodeURIComponent(deposit.comment)}`}
                >
                  <Wallet size={18} /> {t("deposit.openWallet")}
                </a>
              )}
            </div>
          </Card>
        </Section>
      )}
      {amPayer && alreadyPaid && <div className={s.note}>{t("deposit.paid")}</div>}
    </>
  );
}

export function SettlePage({ groupId }: { groupId: string }) {
  const { t, locale } = useI18n();
  const { data: summary, isLoading } = useGroupSummary(groupId);
  const { data: wallet } = useWallet();
  const createSettlement = useCreateSettlement(groupId);
  const agree = useAgreeSettlement(groupId);
  const createManual = useCreateManualSettlement(groupId);
  const confirmManual = useConfirmManualSettlement(groupId);
  const rejectManual = useRejectManualSettlement(groupId);

  const [asset, setAsset] = useState<SettlementAsset>("TON");
  const [mode, setMode] = useState<"whole" | "pick">("whole");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const activeId = summary?.activeSettlement?.id ?? null;
  const { data: live } = useQuery({
    queryKey: ["settlement", activeId],
    queryFn: () => api.getSettlement(activeId!),
    enabled: !!activeId,
    refetchInterval: 4000,
    initialData: summary?.activeSettlement ?? undefined,
  });

  if (isLoading) return <Screen eyebrow={t("settle.eyebrow")} title={t("settle.title")}><Spinner /></Screen>;
  if (!summary) return null;

  const settlement: SettlementDTO | null = live ?? summary.activeSettlement;
  const money = (c: number, cur: string) => `${formatCents(c, cur, locale)} ${cur}`;
  const myTgId = getSession()?.telegramId ?? null;
  const me = summary.group.members.find((m) => m.telegramId === myTgId);

  // ── Manual (off-app) settle-ups ────────────────────────────────────────────
  const iOwe = me ? summary.suggestions.filter((tr) => tr.from.id === me.id) : [];
  const oweByUser = new Map(iOwe.map((tr) => [tr.to.id, tr.amountCents]));
  const manualSection = (
    <>
      {iOwe.length > 0 && (
        <Section label={t("manual.paidSomeone")} footer={t("manual.paidSomeoneFooter")}>
          <Card pad="sm">
            {iOwe.map((tr) => (
              <ListRow
                key={tr.to.id}
                title={<span>{t("manual.youPaid", { name: displayName(tr.to) })}</span>}
                after={
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={createManual.isPending}
                    onClick={() =>
                      createManual.mutate({ groupId, toUserId: tr.to.id, amountCents: tr.amountCents })
                    }
                  >
                    {t("manual.iPaid", { amount: money(tr.amountCents, summary.currency) })}
                  </Button>
                }
              />
            ))}
          </Card>
        </Section>
      )}

      {summary.manualSettlements.length > 0 && (
        <Section label={t("manual.settleUps")} footer={t("manual.settleUpsFooter")}>
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
                        <span className={s.tRole}>{t("manual.paidRole")}</span>
                      </div>
                      <span className={s.tArrow}>
                        <ArrowRight size={16} className="rtl-flip" />
                      </span>
                      <div className={s.tParty}>
                        <span className={s.tName}>{displayName(ms.to)}</span>
                        <span className={s.tRole}>{t("manual.receivedRole")}</span>
                      </div>
                    </div>
                  }
                  subtitle={t(`manual.${ms.status as ManualSettlementStatus}`)}
                  after={
                    ms.status === "pending" && iAmRecipient ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button size="sm" loading={confirmManual.isPending} onClick={() => confirmManual.mutate(ms.id)}>
                          {t("manual.confirm")}
                        </Button>
                        <Button size="sm" variant="secondary" loading={rejectManual.isPending} onClick={() => rejectManual.mutate(ms.id)}>
                          {t("manual.reject")}
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

  // ── No open settlement: offer to start one ─────────────────────────────────
  if (!settlement) {
    if (summary.suggestions.length === 0) {
      return (
        <Screen eyebrow={t("settle.eyebrow")} title={t("settle.title")}>
          <EmptyState icon={<PartyPopper size={30} />} title={t("settle.nothingTitle")}>
            {t("settle.nothingBody")}
          </EmptyState>
          {manualSection}
        </Screen>
      );
    }

    const others = summary.group.members.filter((m) => m.id !== me?.id);
    const toggle = (id: string) => {
      const next = new Set(picked);
      next.has(id) ? next.delete(id) : next.add(id);
      setPicked(next);
    };
    const proposeWhole = () => createSettlement.mutate({ groupId, asset });
    const proposePick = () => createSettlement.mutate({ groupId, asset, toUserIds: [...picked] });

    return (
      <Screen eyebrow={t("settle.eyebrow")} title={t("settle.title")}>
        <WalletCard />
        {manualSection}
        <Section label={t("settle.start")} footer={t("settle.startFooter")}>
          <Card>
            <SegmentedControl
              value={mode}
              onChange={setMode}
              options={[
                { value: "whole", label: t("settle.modeWhole") },
                { value: "pick", label: t("settle.modePick") },
              ]}
            />
            <div style={{ marginTop: "var(--s-3)" }}>
              <Select label={t("settle.payWith")} value={asset} onChange={(e) => setAsset(e.target.value as SettlementAsset)}>
                <option value="TON">TON</option>
                <option value="USDT">USDT</option>
              </Select>
            </div>
          </Card>

          {mode === "whole" ? (
            <>
              <Card pad="sm">
                {summary.suggestions.map((tr, i) => (
                  <ListRow
                    key={i}
                    title={
                      <div className={s.transfer}>
                        <div className={s.tParty}>
                          <span className={s.tName}>{displayName(tr.from)}</span>
                          <span className={s.tRole}>{t("transfer.pays")}</span>
                        </div>
                        <span className={s.tArrow}><ArrowRight size={16} className="rtl-flip" /></span>
                        <div className={s.tParty}>
                          <span className={s.tName}>{displayName(tr.to)}</span>
                          <span className={s.tRole}>{t("transfer.receives")}</span>
                        </div>
                      </div>
                    }
                    after={<span className={s.tAmount}>{money(tr.amountCents, summary.currency)}</span>}
                  />
                ))}
              </Card>
              <Button stretched loading={createSettlement.isPending} onClick={proposeWhole}>
                {t("settle.propose")}
              </Button>
            </>
          ) : (
            <>
              <p className={s.pickHint}>{t("settle.pickHint")}</p>
              <Card pad="sm">
                {others.map((u) => {
                  const owed = oweByUser.get(u.id);
                  return (
                    <ListRow
                      key={u.id}
                      title={<span className={s.tName}>{displayName(u)}</span>}
                      subtitle={owed ? t("settle.youOweThem", { amount: money(owed, summary.currency) }) : t("settle.noKnownDebt")}
                      after={<Checkbox checked={picked.has(u.id)} onChange={() => toggle(u.id)} aria-label={displayName(u)} />}
                      multiline
                    />
                  );
                })}
              </Card>
              <Button stretched disabled={picked.size === 0} loading={createSettlement.isPending} onClick={proposePick}>
                {t("settle.proposePick", { n: picked.size })}
              </Button>
            </>
          )}
        </Section>
      </Screen>
    );
  }

  // ── Open settlement ─────────────────────────────────────────────────────────
  const agreed = new Set(settlement.agreedUserIds);
  const iAmInvolved = !!me && settlement.involved.some((u) => u.id === me.id);
  const iAmReceiver = !!me && settlement.transfers.some((tr) => tr.to.id === me.id);
  const amPayer = !!me && settlement.transfers.some((tr) => tr.from.id === me.id);
  const iAgreed = !!me && agreed.has(me.id);
  const needWallet = iAmReceiver && !wallet?.tonAddress;

  const party = (u: UserDTO, role: string) => (
    <div className={s.tParty}>
      <span className={s.tName}>{displayName(u)}</span>
      <span className={s.tRole}>{role}</span>
    </div>
  );

  return (
    <Screen eyebrow={t("settle.eyebrow")} title={t("settle.title")}>
      <Card glow={settlement.status === "released" ? "success" : "purple"}>
        {settlement.status !== "cancelled" && <StatusStepper status={settlement.status} />}
        <div className={`${s.statusText} ${settlement.status === "cancelled" ? s.cancelled : ""}`}>
          {t(`settle.status.${settlement.status}`)}
        </div>
      </Card>

      {settlement.status === "released" && <div className={s.celebrate}>{t("settle.celebrate")}</div>}

      <Section label={t("settle.transfers", { asset: settlement.asset })}>
        <Card pad="sm">
          {settlement.transfers.map((tr) => (
            <ListRow
              key={tr.id}
              title={
                <div className={s.transfer}>
                  {party(tr.from, t("transfer.pays"))}
                  <span className={s.tArrow}><ArrowRight size={16} className="rtl-flip" /></span>
                  {party(tr.to, t("transfer.receives"))}
                </div>
              }
              after={
                <span className={`${s.tAmount} ${tr.paid ? s.tPaid : ""}`}>
                  {tr.paid && "✓ "}
                  {money(tr.amountCents, settlement.asset)}
                </span>
              }
            />
          ))}
        </Card>
      </Section>

      <Section label={t("settle.agreements")} footer={t("settle.agreementsFooter")}>
        <Card pad="sm">
          {settlement.involved.map((u) => {
            const ok = agreed.has(u.id);
            return (
              <div key={u.id} className={s.agree}>
                <span className={[s.tick, ok && s.tickOn].filter(Boolean).join(" ")}>
                  <Check size={15} strokeWidth={3} />
                </span>
                <span className={s.agreeName}>{displayName(u)}</span>
                <span className={s.waiting}>{ok ? t("settle.done") : t("settle.waiting")}</span>
              </div>
            );
          })}
        </Card>
      </Section>

      {(settlement.status === "deployed" || settlement.status === "released") && (
        <EscrowPanel settlement={settlement} amPayer={amPayer} />
      )}

      {settlement.status === "proposed" && iAmInvolved && !iAgreed && needWallet && <WalletCard />}

      <div className={s.actions}>
        {settlement.status === "proposed" && iAmInvolved && !iAgreed && (
          <>
            {needWallet && <div className={s.note}>{t("settle.needWallet")}</div>}
            <Button stretched disabled={needWallet} loading={agree.isPending} onClick={() => agree.mutate(settlement.id)}>
              <Check size={18} /> {t("settle.agreeBtn")}
            </Button>
          </>
        )}
        {settlement.status === "proposed" && iAgreed && <div className={s.note}>{t("settle.youAgreed")}</div>}
        {!iAmInvolved && settlement.status === "proposed" && <div className={s.note}>{t("settle.notInvolved")}</div>}
      </div>
    </Screen>
  );
}
