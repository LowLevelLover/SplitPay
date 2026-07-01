import { Cell, List, Section, Spinner, Placeholder } from "@telegram-apps/telegram-ui";
import { useGroupSummary } from "../hooks/useGroup.js";
import { formatCents } from "../lib/format.js";

export function BalancesPage({ groupId }: { groupId: string }) {
  const { data, isLoading, error } = useGroupSummary(groupId);

  if (isLoading) return <Spinner size="l" />;
  if (error) return <Placeholder header="Something went wrong">{String(error)}</Placeholder>;
  if (!data) return null;

  const { balances, suggestions, currency } = data;

  return (
    <List>
      <Section header="Balances" footer="Positive means the group owes them.">
        {balances.map((b) => {
          const sign = b.netCents >= 0 ? "+" : "−";
          return (
            <Cell
              key={b.user.id}
              subtitle={b.user.username ? `@${b.user.username}` : undefined}
              after={`${sign}${formatCents(b.netCents)} ${currency}`}
            >
              {b.user.firstName}
            </Cell>
          );
        })}
      </Section>

      <Section header="Who pays whom">
        {suggestions.length === 0 ? (
          <Cell>🎉 All settled up!</Cell>
        ) : (
          suggestions.map((s, i) => (
            <Cell
              key={i}
              subtitle={`to ${s.to.firstName}`}
              after={`${formatCents(s.amountCents)} ${currency}`}
            >
              {s.from.firstName}
            </Cell>
          ))
        )}
      </Section>
    </List>
  );
}
