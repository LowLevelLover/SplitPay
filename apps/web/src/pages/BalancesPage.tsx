import { ArrowRight, PartyPopper, TriangleAlert, Users } from "lucide-react";
import {
  AnimatedNumber,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  ListRow,
  MiniBar,
  Screen,
  Section,
  Skeleton,
} from "../ui/index.js";
import { useGroupSummary } from "../hooks/useGroup.js";
import { displayName, formatCents } from "../lib/format.js";
import { getSession } from "../lib/session.js";
import { useI18n } from "../i18n/index.js";
import s from "./BalancesPage.module.css";

export function BalancesPage({ groupId, onSettle }: { groupId: string; onSettle: () => void }) {
  const { t, locale } = useI18n();
  const { data, isLoading, error } = useGroupSummary(groupId);

  if (isLoading) return <BalancesSkeleton />;
  if (error)
    return (
      <Screen eyebrow={t("app.name")} title={t("balances.title")}>
        <EmptyState icon={<TriangleAlert size={30} />} title={t("balances.errorTitle")} error>
          {t("balances.errorBody")}
        </EmptyState>
      </Screen>
    );
  if (!data) return null;

  const { balances, suggestions, currency, activeSettlement, group } = data;
  const money = (c: number) => formatCents(c, currency, locale);

  const myTgId = getSession()?.telegramId ?? null;
  const me = balances.find((b) => b.user.telegramId === myTgId);
  const myNet = me?.netCents ?? 0;
  const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.netCents)));
  const telegramHandle = me?.user.username ? `@${me.user.username}` : null;

  const heroTone = myNet > 0 ? s.owed : myNet < 0 ? s.owe : s.flat;
  const heroLabel = !me
    ? t("balances.groupBalance")
    : myNet > 0
      ? t("balances.youAreOwed")
      : myNet < 0
        ? t("balances.youOwe")
        : t("balances.allSettled");
  const heroValue = me ? Math.abs(myNet) : balances.reduce((a, b) => a + Math.max(0, b.netCents), 0);

  return (
    <Screen eyebrow={t("app.name")} title={t("balances.title")}>
      <Card
        glow={myNet < 0 ? "pink" : "success"}
        pad="none"
        style={{ animationDelay: "40ms" }}
      >
        <div className={s.hero}>
          {me && (
            <div className={s.identity}>
              <span>{displayName(me.user)}</span>
              {telegramHandle && <span>{telegramHandle}</span>}
            </div>
          )}
          <span className={s.heroLabel}>{heroLabel}</span>
          <div className={`${s.heroValue} ${heroTone}`} aria-live="polite">
            {me && myNet !== 0 && (myNet > 0 ? "+" : "-")}
            <AnimatedNumber value={heroValue} format={money} />
            <small>{currency}</small>
          </div>
          <div className={s.stats}>
            <Badge color="var(--purple)">
              <Users size={12} /> {t("balances.members", { n: group.members.length })}
            </Badge>
            {suggestions.length > 0 && (
              <Badge color="var(--cyan)">
                {t("balances.transfersToSettle", { n: suggestions.length })}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {activeSettlement ? (
        <Banner
          glow="purple"
          header={t("balances.inProgressHeader")}
          subheader={t("balances.inProgressSub", {
            status: t(`settle.status.${activeSettlement.status}`),
          })}
          action={
            <Button size="sm" variant="secondary" onClick={onSettle}>
              {t("balances.open")}
            </Button>
          }
        />
      ) : suggestions.length > 0 ? (
        <Banner
          glow="cyan"
          header={t("balances.readyHeader")}
          subheader={t("balances.readySub")}
          action={
            <Button size="sm" onClick={onSettle}>
              {t("balances.settle")}
            </Button>
          }
        />
      ) : null}

      <Section label={t("balances.section")} footer={t("balances.sectionFooter")}>
        <Card pad="sm">
          {balances.map((b) => {
            const pos = b.netCents > 0;
            const zero = b.netCents === 0;
            return (
              <ListRow
                key={b.user.id}
                title={
                  <div className={s.memberMain}>
                    <span>{b.user.firstName}</span>
                    <div className={s.memberBar}>
                      <MiniBar magnitude={Math.abs(b.netCents) / maxAbs} owed={pos} />
                    </div>
                  </div>
                }
                subtitle={b.user.username ? `@${b.user.username}` : undefined}
                after={
                  <span className={zero ? s.zero : pos ? s.pos : s.neg}>
                    {zero ? "--" : `${pos ? "+" : "-"}${money(Math.abs(b.netCents))}`}
                  </span>
                }
                multiline
              />
            );
          })}
        </Card>
      </Section>

      <Section label={t("balances.whoPaysWhom")} footer={t("balances.whoPaysWhomFooter")}>
        {suggestions.length === 0 ? (
          <Card>
            <EmptyState icon={<PartyPopper size={30} />} title={t("balances.allSquareTitle")}>
              {t("balances.allSquareBody")}
            </EmptyState>
          </Card>
        ) : (
          <Card pad="sm">
            {suggestions.map((tr, i) => (
              <ListRow
                key={i}
                title={
                  <div className={s.transfer}>
                    <div className={s.tParty}>
                      <span className={s.tName}>{displayName(tr.from)}</span>
                      <span className={s.tRole}>{t("transfer.pays")}</span>
                    </div>
                    <span className={s.tArrow}>
                      <ArrowRight size={16} className="rtl-flip" />
                    </span>
                    <div className={s.tParty}>
                      <span className={s.tName}>{displayName(tr.to)}</span>
                      <span className={s.tRole}>{t("transfer.receives")}</span>
                    </div>
                  </div>
                }
                after={
                  <span className={s.tAmount}>
                    {money(tr.amountCents)} {currency}
                  </span>
                }
              />
            ))}
          </Card>
        )}
      </Section>
    </Screen>
  );
}

function BalancesSkeleton() {
  const { t } = useI18n();
  return (
    <Screen eyebrow={t("app.name")} title={t("balances.title")}>
      <Card pad="none">
        <div style={{ padding: "24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton w={120} h={12} />
          <Skeleton w={220} h={48} radius={12} />
          <Skeleton w={160} h={22} radius={999} />
        </div>
      </Card>
      <Card pad="sm">
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0" }}>
            <Skeleton w={40} h={40} radius={10} />
            <Skeleton w="55%" h={14} />
            <Skeleton w={64} h={14} style={{ marginInlineStart: "auto" }} />
          </div>
        ))}
      </Card>
    </Screen>
  );
}
