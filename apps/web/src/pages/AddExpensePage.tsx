import { useMemo, useState } from "react";
import { CircleAlert } from "lucide-react";
import type { CreateExpenseInput, UserDTO } from "@split-pay/shared";
import {
  Button,
  Card,
  Checkbox,
  Input,
  ListRow,
  MiniInput,
  Screen,
  Section,
  SegmentedControl,
  Select,
  Spinner,
} from "../ui/index.js";
import { useCreateExpense, useGroupSummary } from "../hooks/useGroup.js";
import { displayName } from "../lib/format.js";
import { getCurrentTelegramId } from "../lib/telegram.js";
import s from "./AddExpensePage.module.css";

type Strategy = "equal" | "percent" | "exact";
const toCents = (v: string) => Math.round((parseFloat(v) || 0) * 100);

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

  if (isLoading) return <Screen eyebrow="SplitPay" title="Add expense"><Spinner /></Screen>;
  if (!data) return null;

  const payer = payerId || defaultPayer;
  const isIncluded = (id: string) => included[id] ?? true; // default everyone in
  const selectedIds = members.filter((m) => isIncluded(m.id)).map((m) => m.id);

  async function submit() {
    setErr(null);
    const amountCents = toCents(amount);
    if (amountCents <= 0) return setErr("Enter an amount greater than zero.");
    if (selectedIds.length === 0) return setErr("Pick at least one participant.");

    let split: CreateExpenseInput["split"];
    if (strategy === "equal") {
      split = { strategy: "equal", participantIds: selectedIds };
    } else if (strategy === "percent") {
      const shares = selectedIds.map((userId) => ({ userId, percent: parseFloat(values[userId] ?? "") || 0 }));
      if (shares.some((sh) => sh.percent <= 0)) return setErr("Enter a percent for each participant.");
      split = { strategy: "percent", shares };
    } else {
      const shares = selectedIds.map((userId) => ({ userId, amountCents: toCents(values[userId] ?? "") }));
      const sum = shares.reduce((a, sh) => a + sh.amountCents, 0);
      if (sum !== amountCents) return setErr(`Exact shares must add up to ${amount}.`);
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
    <Screen eyebrow="SplitPay" title="Add expense">
      <Card>
        <div className={s.form}>
          <Input
            label="Description"
            placeholder="Dinner at Shandiz"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input
            label="Amount"
            big
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <div className={s.grid2}>
            <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="IRT">IRT · تومان</option>
              <option value="USDT">USDT</option>
              <option value="TON">TON</option>
            </Select>
            <Select label="Paid by" value={payer} onChange={(e) => setPayerId(e.target.value)}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {displayName(m)}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      <Section label="Split">
        <SegmentedControl<Strategy>
          value={strategy}
          onChange={setStrategy}
          options={[
            { value: "equal", label: "Equally" },
            { value: "percent", label: "By %" },
            { value: "exact", label: "Exact" },
          ]}
        />
      </Section>

      <Section
        label="Participants"
        footer={strategy !== "equal" ? "Enter a value for each included person." : undefined}
      >
        <Card pad="sm">
          {members.map((m) => (
            <ListRow
              key={m.id}
              before={
                <Checkbox
                  aria-label={`Include ${displayName(m)}`}
                  checked={isIncluded(m.id)}
                  onChange={(checked) => setIncluded((st) => ({ ...st, [m.id]: checked }))}
                />
              }
              title={displayName(m)}
              after={
                strategy !== "equal" && isIncluded(m.id) ? (
                  <MiniInput
                    type="number"
                    inputMode="decimal"
                    placeholder={strategy === "percent" ? "%" : "amount"}
                    value={values[m.id] ?? ""}
                    onChange={(e) => setValues((st) => ({ ...st, [m.id]: e.target.value }))}
                  />
                ) : undefined
              }
            />
          ))}
        </Card>
      </Section>

      {err && (
        <div className={s.error} role="alert">
          <CircleAlert size={16} />
          {err}
        </div>
      )}

      <div className={s.submit}>
        <Button stretched loading={createExpense.isPending} onClick={submit}>
          Add expense
        </Button>
      </div>
    </Screen>
  );
}
