import { useMemo, useState } from "react";
import {
  Button,
  Cell,
  Checkbox,
  Input,
  Placeholder,
  Section,
  Select,
  Spinner,
} from "@telegram-apps/telegram-ui";
import type { CreateExpenseInput, UserDTO } from "@split-pay/shared";
import { useCreateExpense, useGroupSummary } from "../hooks/useGroup.js";
import { displayName } from "../lib/format.js";
import { getCurrentTelegramId } from "../lib/telegram.js";

type Strategy = "equal" | "percent" | "exact";
const toCents = (s: string) => Math.round((parseFloat(s) || 0) * 100);

export function AddExpensePage({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const { data, isLoading } = useGroupSummary(groupId);
  const createExpense = useCreateExpense(groupId);

  const members: UserDTO[] = data?.group.members ?? [];
  const myTgId = getCurrentTelegramId();
  const defaultPayer = useMemo(
    () => members.find((m) => m.telegramId === myTgId)?.id ?? members[0]?.id ?? "",
    [members, myTgId],
  );

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("IRT");
  const [payerId, setPayerId] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("equal");
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  if (isLoading) return <Spinner size="l" />;
  if (!data) return <Placeholder header="Load a group first" />;

  const payer = payerId || defaultPayer;
  const isIncluded = (id: string) => included[id] ?? true; // default everyone in
  const selectedIds = members.filter((m) => isIncluded(m.id)).map((m) => m.id);

  async function submit() {
    setErr(null);
    const amountCents = toCents(amount);
    if (amountCents <= 0) return setErr("Enter an amount.");
    if (selectedIds.length === 0) return setErr("Pick at least one participant.");

    let split: CreateExpenseInput["split"];
    if (strategy === "equal") {
      split = { strategy: "equal", participantIds: selectedIds };
    } else if (strategy === "percent") {
      const shares = selectedIds.map((userId) => ({ userId, percent: parseFloat(values[userId] ?? "") || 0 }));
      if (shares.some((s) => s.percent <= 0)) return setErr("Enter a percent for each participant.");
      split = { strategy: "percent", shares };
    } else {
      const shares = selectedIds.map((userId) => ({ userId, amountCents: toCents(values[userId] ?? "") }));
      const sum = shares.reduce((a, s) => a + s.amountCents, 0);
      if (sum !== amountCents) return setErr(`Exact shares must sum to ${amount}.`);
      split = { strategy: "exact", shares };
    }

    try {
      await createExpense.mutateAsync({
        groupId,
        payerId: payer,
        amountCents,
        currency,
        description: description || null,
        split,
      });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add expense.");
    }
  }

  return (
    <div>
      <Section header="New expense">
        <Input header="Description" placeholder="Dinner" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input header="Amount" type="number" placeholder="60000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select header="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
          <option value="IRT">IRT (تومان)</option>
          <option value="USDT">USDT</option>
          <option value="TON">TON</option>
        </Select>
        <Select header="Paid by" value={payer} onChange={(e) => setPayerId(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {displayName(m)}
            </option>
          ))}
        </Select>
        <Select header="Split" value={strategy} onChange={(e) => setStrategy(e.target.value as Strategy)}>
          <option value="equal">Equally</option>
          <option value="percent">By percent</option>
          <option value="exact">Exact amounts</option>
        </Select>
      </Section>

      <Section header="Participants" footer={strategy !== "equal" ? "Enter a value for each included person." : undefined}>
        {members.map((m) => (
          <Cell
            key={m.id}
            before={
              <Checkbox
                checked={isIncluded(m.id)}
                onChange={(e) => setIncluded((s) => ({ ...s, [m.id]: e.target.checked }))}
              />
            }
            after={
              strategy !== "equal" && isIncluded(m.id) ? (
                <input
                  style={{ width: 80, textAlign: "right" }}
                  type="number"
                  placeholder={strategy === "percent" ? "%" : "amount"}
                  value={values[m.id] ?? ""}
                  onChange={(e) => setValues((s) => ({ ...s, [m.id]: e.target.value }))}
                />
              ) : undefined
            }
          >
            {displayName(m)}
          </Cell>
        ))}
      </Section>

      {err && (
        <div style={{ color: "var(--tg-theme-destructive-text-color, #d00)", padding: "0 16px" }}>{err}</div>
      )}

      <div style={{ padding: 16 }}>
        <Button stretched size="l" loading={createExpense.isPending} onClick={submit}>
          Add expense
        </Button>
      </div>
    </div>
  );
}
