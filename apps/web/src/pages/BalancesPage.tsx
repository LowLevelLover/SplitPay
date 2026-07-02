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
import { getCurrentTelegramId } from "../lib/telegram.js";
import s from "./BalancesPage.module.css";

export function BalancesPage({ groupId, onSettle }: { groupId: string; onSettle: () => void }) {
  const { data, isLoading, error } = useGroupSummary(groupId);

  if (isLoading) return <BalancesSkeleton />;
  if (error)
    return (
      <Screen eyebrow="SplitPay" title="Balances">
        <EmptyState icon={<TriangleAlert size={30} />} title="Couldn't load balances" error>
          Check your connection and reopen SplitPay from your group.
        </EmptyState>
      </Screen>
    );
  if (!data) return null;

  const { balances, suggestions, currency, activeSettlement, group } = data;
  const money = (c: number) => formatCents(c, currency);

  const myTgId = getCurrentTelegramId();
  const me = balances.find((b) => b.user.telegramId === myTgId);
  const myNet = me?.netCents ?? 0;
  const maxAbs = Math.max(1, ...balances.map((b) => Math.abs(b.netCents)));

  const heroTone = myNet > 0 ? s.owed : myNet < 0 ? s.owe : s.flat;
  const heroLabel = !me
    ? "Group balance"
    : myNet > 0
      ? "You are owed"
      : myNet < 0
        ? "You owe"
        : "You're all settled";
  const heroValue = me ? Math.abs(myNet) : balances.reduce((a, b) => a + Math.max(0, b.netCents), 0);

  return (
    <Screen eyebrow="SplitPay" title="Balances">
      <Card
        glow={myNet < 0 ? "pink" : "success"}
        pad="none"
        style={{ animationDelay: "40ms" }}
      >
        <div className={s.hero}>
          <span className={s.heroLabel}>{heroLabel}</span>
          <div className={`${s.heroValue} ${heroTone}`} aria-live="polite">
            {me && myNet !== 0 && (myNet > 0 ? "+" : "-")}
            <AnimatedNumber value={heroValue} format={money} />
            <small>{currency}</small>
          </div>
          <div className={s.stats}>
            <Badge color="var(--purple)">
              <Users size={12} /> {group.members.length} members
            </Badge>
            {suggestions.length > 0 && (
              <Badge color="var(--cyan)">{suggestions.length} transfers to settle</Badge>
            )}
          </div>
        </div>
      </Card>

      {activeSettlement ? (
        <Banner
          glow="purple"
          header="Settlement in progress"
          subheader={`Status: ${activeSettlement.status}. Continue in the Settle tab.`}
          action={
            <Button size="sm" variant="secondary" onClick={onSettle}>
              Open
            </Button>
          }
        />
      ) : suggestions.length > 0 ? (
        <Banner
          glow="cyan"
          header="Ready to settle up?"
          subheader="Clear every debt in one on-chain round on TON."
          action={
            <Button size="sm" onClick={onSettle}>
              Settle
            </Button>
          }
        />
      ) : null}

      <Section label="Balances" footer="Positive means the group owes them.">
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

      <Section label="Who pays whom" footer="Minimized to the fewest transfers.">
        {suggestions.length === 0 ? (
          <Card>
            <EmptyState icon={<PartyPopper size={30} />} title="All settled up">
              No debts outstanding in this group.
            </EmptyState>
          </Card>
        ) : (
          <Card pad="sm">
            {suggestions.map((t, i) => (
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
                after={
                  <span className={s.tAmount}>
                    {money(t.amountCents)} {currency}
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
  return (
    <Screen eyebrow="SplitPay" title="Balances">
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
            <Skeleton w={64} h={14} style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </Card>
    </Screen>
  );
}
