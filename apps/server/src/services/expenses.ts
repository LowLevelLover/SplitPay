import type { ExpenseDTO, SplitInput } from "@split-pay/shared";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { formatCents, splitByWeights, splitEvenly } from "../lib/money.js";
import { ensureMembership } from "./groups.js";
import { getOrCreateUserByUsername, toUserDTO } from "./users.js";
import type { ParsedOp, SplitStrategy } from "../bot/parser/expense.js";
import type { User } from "../db/schema.js";

type ExpenseRow = typeof schema.expenses.$inferSelect & {
  payer: User;
  shares: { user: User; amountCents: number; description: string | null }[];
};

function toExpenseDTO(e: ExpenseRow): ExpenseDTO {
  return {
    id: e.id,
    groupId: e.groupId,
    payer: toUserDTO(e.payer),
    amountCents: e.amountCents,
    currency: e.currency,
    description: e.description,
    participants: e.shares.map((s) => toUserDTO(s.user)),
    shares: e.shares.map((s) => ({
      user: toUserDTO(s.user),
      amountCents: s.amountCents,
      description: s.description,
    })),
    kind: e.kind as ExpenseDTO["kind"],
    createdAt: e.createdAt.toISOString(),
  };
}

/** Turn a split strategy into concrete per-user cent amounts summing to total. */
function resolveShares(
  totalCents: number,
  split: SplitInput,
  currency: string,
): { userId: string; amountCents: number }[] {
  const fmt = (c: number) => `${formatCents(c, currency)} ${currency}`;
  if (split.strategy === "equal") {
    const amounts = splitEvenly(totalCents, split.participantIds.length);
    return split.participantIds.map((userId, i) => ({ userId, amountCents: amounts[i]! }));
  }
  if (split.strategy === "percent") {
    const amounts = splitByWeights(
      totalCents,
      split.shares.map((s) => s.percent),
    );
    return split.shares.map((s, i) => ({ userId: s.userId, amountCents: amounts[i]! }));
  }
  if (split.strategy === "shares") {
    const amounts = splitByWeights(
      totalCents,
      split.shares.map((s) => s.shares),
    );
    return split.shares.map((s, i) => ({ userId: s.userId, amountCents: amounts[i]! }));
  }
  if (split.strategy === "adjustment") {
    // Everyone owes an equal slice of what's left after the fixed adjustments.
    const totalAdj = split.shares.reduce((a, s) => a + s.adjustmentCents, 0);
    const remainder = totalCents - totalAdj;
    if (remainder < 0) throw new AppError(`Adjustments (${fmt(totalAdj)}) exceed the total (${fmt(totalCents)})`);
    const base = splitEvenly(remainder, split.shares.length);
    return split.shares.map((s, i) => ({ userId: s.userId, amountCents: base[i]! + s.adjustmentCents }));
  }
  // exact
  const sum = split.shares.reduce((a, s) => a + s.amountCents, 0);
  if (sum !== totalCents) {
    throw new AppError(`Exact shares (${fmt(sum)}) must sum to the total (${fmt(totalCents)})`);
  }
  return split.shares.map((s) => ({ userId: s.userId, amountCents: s.amountCents }));
}

async function insertExpense(input: {
  groupId: string;
  payerId: string;
  amountCents: number;
  currency: string;
  description?: string | null;
  kind?: string;
  shares: { userId: string; amountCents: number; description?: string | null }[];
}): Promise<string> {
  const members = new Set([input.payerId, ...input.shares.map((s) => s.userId)]);
  await Promise.all([...members].map((userId) => ensureMembership(input.groupId, userId)));

  return db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(schema.expenses)
      .values({
        groupId: input.groupId,
        payerId: input.payerId,
        amountCents: input.amountCents,
        currency: input.currency,
        description: input.description ?? null,
        kind: input.kind ?? "expense",
      })
      .returning({ id: schema.expenses.id });

    const shares = input.shares.filter((s) => s.amountCents !== 0);
    if (shares.length) {
      await tx.insert(schema.expenseShares).values(
        shares.map((s) => ({
          expenseId: expense!.id,
          userId: s.userId,
          amountCents: s.amountCents,
          description: s.description ?? null,
        })),
      );
    }
    return expense!.id;
  });
}

async function loadExpense(id: string): Promise<ExpenseDTO> {
  const row = await db.query.expenses.findFirst({
    where: eq(schema.expenses.id, id),
    with: { payer: true, shares: { with: { user: true } } },
  });
  return toExpenseDTO(row as ExpenseRow);
}

/** Record an expense with an explicit split strategy (used by the Mini App). */
export async function createExpense(input: {
  groupId: string;
  payerId: string;
  amountCents: number;
  currency?: string;
  description?: string | null;
  split: SplitInput;
}): Promise<ExpenseDTO> {
  const currency = input.currency ?? "IRT";
  const shares = resolveShares(input.amountCents, input.split, currency);
  if (shares.length === 0) throw new AppError("An expense needs at least one participant");
  const id = await insertExpense({
    groupId: input.groupId,
    payerId: input.payerId,
    amountCents: input.amountCents,
    currency,
    description: input.description,
    shares,
  });
  return loadExpense(id);
}

export async function listExpenses(groupId: string): Promise<ExpenseDTO[]> {
  const rows = await db.query.expenses.findMany({
    where: eq(schema.expenses.groupId, groupId),
    with: { payer: true, shares: { with: { user: true } } },
    orderBy: desc(schema.expenses.createdAt),
  });
  return rows.map((r) => toExpenseDTO(r as ExpenseRow));
}

/**
 * Turn a parsed split (strategy + per-user values keyed by id) into a SplitInput.
 * The payer is always a participant: an explicit value wins, otherwise they take
 * an equal/remainder share (equal, adjustment, exact) or nothing (percent, shares).
 */
async function buildSplit(
  groupId: string,
  strategy: SplitStrategy,
  payerId: string,
  byId: Map<string, number>,
  amountCents: number,
): Promise<SplitInput> {
  if (strategy === "percent")
    return {
      strategy: "percent",
      shares: [...byId].filter(([, v]) => v > 0).map(([userId, v]) => ({ userId, percent: v })),
    };
  if (strategy === "shares")
    return {
      strategy: "shares",
      shares: [...byId].filter(([, v]) => v > 0).map(([userId, v]) => ({ userId, shares: v })),
    };
  if (strategy === "exact") {
    // Payer covers whatever the named exact shares don't (the remainder).
    if (!byId.has(payerId)) {
      const named = [...byId.values()].reduce((a, v) => a + v, 0);
      byId.set(payerId, Math.max(0, amountCents - named));
    }
    return { strategy: "exact", shares: [...byId].map(([userId, v]) => ({ userId, amountCents: v })) };
  }
  if (strategy === "adjustment") {
    if (!byId.has(payerId)) byId.set(payerId, 0);
    return {
      strategy: "adjustment",
      shares: [...byId].map(([userId, v]) => ({ userId, adjustmentCents: v })),
    };
  }
  // equal — named participants, or the whole group when none were named.
  let ids = [...byId.keys()];
  if (ids.length === 0) {
    const members = await db.query.groupMembers.findMany({
      where: eq(schema.groupMembers.groupId, groupId),
    });
    ids = members.map((m) => m.userId);
  }
  if (!ids.includes(payerId)) ids.push(payerId);
  return { strategy: "equal", participantIds: ids };
}

/**
 * Apply the operations parsed from a bot-mention message. Each op names its own
 * payer/participants; unknown @usernames become pending members.
 */
export async function applyParsedOps(groupId: string, ops: ParsedOp[]): Promise<ExpenseDTO[]> {
  const created: ExpenseDTO[] = [];
  const resolve = async (username: string) => (await getOrCreateUserByUsername(username)).id;

  for (const op of ops) {
    if (op.kind === "split") {
      const payerId = await resolve(op.payerUsername);
      // Resolve participants → ids, keeping the last value if one appears twice.
      const byId = new Map<string, number>();
      for (const p of op.participants) byId.set(await resolve(p.username), p.value);
      const split = await buildSplit(groupId, op.strategy, payerId, byId, op.amountCents);
      created.push(
        await createExpense({
          groupId,
          payerId,
          amountCents: op.amountCents,
          currency: op.currency,
          description: op.description,
          split,
        }),
      );
    } else if (op.kind === "debt") {
      // "from owes to": model as `to paid`, single share on `from`.
      const [fromId, toId] = await Promise.all([resolve(op.fromUsername), resolve(op.toUsername)]);
      const id = await insertExpense({
        groupId,
        payerId: toId,
        amountCents: op.amountCents,
        currency: op.currency,
        description: op.description,
        kind: "debt",
        shares: [{ userId: fromId, amountCents: op.amountCents }],
      });
      created.push(await loadExpense(id));
    } else if (op.kind === "ledger") {
      created.push(...(await applyLedger(groupId, op.entries, op.currency)));
    }
    // "settle" ops are handled in the bot layer (they need recipient approval).
  }

  return created;
}

/**
 * Ledger: negative items = a user's consumption, positive = amount they paid.
 * One expense per payer; each payer's amount is shared across all consumers
 * weighted by consumption, so net balances come out exactly right.
 */
async function applyLedger(
  groupId: string,
  entries: { username: string; items: { amountCents: number; description: string | null }[] }[],
  currency: string,
): Promise<ExpenseDTO[]> {
  const paid = new Map<string, number>();
  const consumed = new Map<string, number>();
  const paidDesc = new Map<string, string[]>();
  const consumedDesc = new Map<string, string[]>();

  for (const entry of entries) {
    const userId = (await getOrCreateUserByUsername(entry.username)).id;
    for (const item of entry.items) {
      if (item.amountCents >= 0) {
        paid.set(userId, (paid.get(userId) ?? 0) + item.amountCents);
        if (item.description) paidDesc.set(userId, [...(paidDesc.get(userId) ?? []), item.description]);
      } else {
        consumed.set(userId, (consumed.get(userId) ?? 0) + -item.amountCents);
        if (item.description)
          consumedDesc.set(userId, [...(consumedDesc.get(userId) ?? []), item.description]);
      }
    }
  }

  const totalPaid = [...paid.values()].reduce((a, v) => a + v, 0);
  if (totalPaid === 0) throw new AppError("Ledger has no payments (need a +amount somewhere)");

  const consumers = [...consumed.entries()].filter(([, c]) => c > 0);
  if (consumers.length === 0)
    throw new AppError("I see payments but no one's consumption — add -amounts, or drop the + to split equally.");
  const created: ExpenseDTO[] = [];

  for (const [payerId, paidCents] of paid) {
    if (paidCents === 0) continue;
    // Each payer covers a proportional slice of every consumer's consumption.
    const amounts = splitByWeights(paidCents, consumers.map(([, c]) => c));
    const shares = consumers.map(([userId], i) => ({
      userId,
      amountCents: amounts[i]!,
      description: consumedDesc.get(userId)?.join("، ") ?? null,
    }));
    const id = await insertExpense({
      groupId,
      payerId,
      amountCents: paidCents,
      currency,
      description: paidDesc.get(payerId)?.join("، ") ?? null,
      shares,
    });
    created.push(await loadExpense(id));
  }

  return created;
}
