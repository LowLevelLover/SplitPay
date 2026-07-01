import { Banner, Button, Cell, List, Placeholder, Section, Spinner } from "@telegram-apps/telegram-ui";
import { useGroupSummary } from "../hooks/useGroup.js";
import { displayName, formatCents } from "../lib/format.js";

export function BalancesPage({ groupId, onSettle }: { groupId: string; onSettle: () => void }) {
  const { data, isLoading, error } = useGroupSummary(groupId);

  if (isLoading) return <Spinner size="l" />;
  if (error) return <Placeholder header="Something went wrong">{String(error)}</Placeholder>;
  if (!data) return null;

  const { balances, suggestions, currency, activeSettlement } = data;

  return (
    <List>
      {activeSettlement ? (
        <Banner
          header="Settlement in progress"
          subheader={`Status: ${activeSettlement.status}. Open the Settle tab to continue.`}
        >
          <Button size="s" onClick={onSettle}>
            Go to settlement
          </Button>
        </Banner>
      ) : suggestions.length > 0 ? (
        <Banner header="Ready to settle up?" subheader="Pay each other on TON in one go.">
          <Button size="s" onClick={onSettle}>
            Settle on TON
          </Button>
        </Banner>
      ) : null}

      <Section header="Balances" footer="Positive means the group owes them.">
        {balances.map((b) => {
          const sign = b.netCents >= 0 ? "+" : "−";
          return (
            <Cell
              key={b.user.id}
              subtitle={b.user.username ? `@${b.user.username}` : undefined}
              after={`${sign}${formatCents(b.netCents, currency)} ${currency}`}
            >
              {b.user.firstName}
            </Cell>
          );
        })}
      </Section>

      <Section header="Who pays whom" footer="Minimized to the fewest transfers.">
        {suggestions.length === 0 ? (
          <Cell>🎉 All settled up!</Cell>
        ) : (
          suggestions.map((s, i) => (
            <Cell
              key={i}
              subtitle={`to ${displayName(s.to)}`}
              after={`${formatCents(s.amountCents, currency)} ${currency}`}
            >
              {displayName(s.from)}
            </Cell>
          ))
        )}
      </Section>
    </List>
  );
}
