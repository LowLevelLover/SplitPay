import type { ExpenseDTO } from "@split-pay/shared";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { splitEvenly } from "../lib/money.js";
import { ensureMembership } from "./groups.js";
import { toUserDTO } from "./users.js";
import type { User } from "../db/schema.js";

type ExpenseRow = typeof schema.expenses.$inferSelect & {
  payer: User;
  shares: { user: User }[];
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
    createdAt: e.createdAt.toISOString(),
  };
}

/** Record an expense split EVENLY among `participantIds` (payer included). */
export async function createExpense(input: {
  groupId: string;
  payerId: string;
  amountCents: number;
  currency?: string;
  description?: string | null;
  participantIds: string[];
}): Promise<ExpenseDTO> {
  if (input.participantIds.length === 0) {
    throw new AppError("An expense needs at least one participant");
  }

  const shareAmounts = splitEvenly(input.amountCents, input.participantIds.length);

  await Promise.all(
    [input.payerId, ...input.participantIds].map((userId) =>
      ensureMembership(input.groupId, userId),
    ),
  );

  const expenseId = await db.transaction(async (tx) => {
    const [expense] = await tx
      .insert(schema.expenses)
      .values({
        groupId: input.groupId,
        payerId: input.payerId,
        amountCents: input.amountCents,
        currency: input.currency ?? "USD",
        description: input.description ?? null,
      })
      .returning({ id: schema.expenses.id });

    await tx.insert(schema.expenseShares).values(
      input.participantIds.map((userId, i) => ({
        expenseId: expense!.id,
        userId,
        amountCents: shareAmounts[i]!,
      })),
    );
    return expense!.id;
  });

  const row = await db.query.expenses.findFirst({
    where: eq(schema.expenses.id, expenseId),
    with: { payer: true, shares: { with: { user: true } } },
  });
  return toExpenseDTO(row as ExpenseRow);
}

export async function listExpenses(groupId: string): Promise<ExpenseDTO[]> {
  const rows = await db.query.expenses.findMany({
    where: eq(schema.expenses.groupId, groupId),
    with: { payer: true, shares: { with: { user: true } } },
    orderBy: desc(schema.expenses.createdAt),
  });
  return rows.map((r) => toExpenseDTO(r as ExpenseRow));
}
