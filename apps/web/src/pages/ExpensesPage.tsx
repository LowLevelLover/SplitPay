import { Cell, List, Placeholder, Section, Spinner } from "@telegram-apps/telegram-ui";
import type { ExpenseDTO } from "@split-pay/shared";
import { useExpenses } from "../hooks/useGroup.js";
import { displayName, formatCents } from "../lib/format.js";

const KIND_LABEL: Record<ExpenseDTO["kind"], string> = {
  expense: "🧾",
  debt: "➡️",
  settlement: "⛓️",
};

export function ExpensesPage({ groupId }: { groupId: string }) {
  const { data, isLoading, error } = useExpenses(groupId);

  if (isLoading) return <Spinner size="l" />;
  if (error) return <Placeholder header="Something went wrong">{String(error)}</Placeholder>;
  if (!data || data.length === 0) {
    return <Placeholder header="No activity yet" description="Mention the bot in your group to add expenses." />;
  }

  return (
    <List>
      <Section header="History">
        {data.map((e) => {
          const title = e.description ?? (e.kind === "settlement" ? "Settlement" : "Expense");
          const parts = e.shares
            .map((s) => `${displayName(s.user)} ${formatCents(s.amountCents, e.currency)}`)
            .join(", ");
          return (
            <Cell
              key={e.id}
              before={<span style={{ fontSize: 22 }}>{KIND_LABEL[e.kind]}</span>}
              subtitle={`${displayName(e.payer)} paid · split: ${parts}`}
              after={`${formatCents(e.amountCents, e.currency)} ${e.currency}`}
              multiline
            >
              {title}
            </Cell>
          );
        })}
      </Section>
    </List>
  );
}
