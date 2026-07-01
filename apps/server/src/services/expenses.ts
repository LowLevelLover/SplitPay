import type { ExpenseDTO, SplitInput } from "@split-pay/shared";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { splitByWeights, splitEvenly } from "../lib/money.js";
import { ensureMembership } from "./groups.js";
import { getOrCreateUserByUsername, toUserDTO } from "./users.js";
import type { ParsedOp } from "../bot/parser/expense.js";
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
): { userId: string; amountCents: number }[] {
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
  // exact
  const sum = split.shares.reduce((a, s) => a + s.amountCents, 0);
  if (sum !== totalCents) {
    throw new AppError(`Exact shares (${sum}) must sum to the total (${totalCents})`);
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
  const shares = resolveShares(input.amountCents, input.split);
  if (shares.length === 0) throw new AppError("An expense needs at least one participant");
  const id = await insertExpense({
    groupId: input.groupId,
    payerId: input.payerId,
    amountCents: input.amountCents,
    currency: input.currency ?? "IRT",
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
 * Apply the operations parsed from a bot-mention message. Each op names its own
 * payer/participants; unknown @usernames become pending members.
 */
export async function applyParsedOps(groupId: string, ops: ParsedOp[]): Promise<ExpenseDTO[]> {
  const created: ExpenseDTO[] = [];
  const resolve = async (username: string) => (await getOrCreateUserByUsername(username)).id;

  for (const op of ops) {
    if (op.kind === "equal") {
      const payerId = await resolve(op.payerUsername);
      let participantIds: string[];
      if (op.participantUsernames.length) {
        participantIds = await Promise.all(op.participantUsernames.map(resolve));
        if (!participantIds.includes(payerId)) participantIds.push(payerId);
      } else {
        const members = await db.query.groupMembers.findMany({
          where: eq(schema.groupMembers.groupId, groupId),
        });
        participantIds = members.map((m) => m.userId);
        if (!participantIds.includes(payerId)) participantIds.push(payerId);
      }
      created.push(
        await createExpense({
          groupId,
          payerId,
          amountCents: op.amountCents,
          currency: op.currency,
          description: op.description,
          split: { strategy: "equal", participantIds },
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
    } else {
      created.push(...(await applyLedger(groupId, op.entries, op.currency)));
    }
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
