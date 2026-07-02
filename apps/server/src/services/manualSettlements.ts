import type { ManualSettlementDTO, ManualSettlementStatus } from "@split-pay/shared";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { ensureMembership } from "./groups.js";
import { toUserDTO } from "./users.js";
import type { ManualSettlement, User } from "../db/schema.js";

type FullManual = ManualSettlement & { from: User; to: User };

function toDTO(m: FullManual): ManualSettlementDTO {
  return {
    id: m.id,
    groupId: m.groupId,
    from: toUserDTO(m.from),
    to: toUserDTO(m.to),
    amountCents: m.amountCents,
    currency: m.currency,
    status: m.status as ManualSettlementStatus,
    note: m.note,
    createdAt: m.createdAt.toISOString(),
    confirmedAt: m.confirmedAt ? m.confirmedAt.toISOString() : null,
  };
}

async function groupCurrency(groupId: string): Promise<string> {
  const g = await db.query.groups.findFirst({ where: eq(schema.groups.id, groupId) });
  return g?.currency ?? "IRT";
}

async function load(id: string): Promise<FullManual> {
  const m = await db.query.manualSettlements.findFirst({
    where: eq(schema.manualSettlements.id, id),
    with: { from: true, to: true },
  });
  if (!m) throw new AppError("Settle-up not found", 404);
  return m as FullManual;
}

/** Record a pending "I paid X" — stays pending until the recipient confirms. */
export async function createManualSettlement(input: {
  groupId: string;
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  note?: string | null;
}): Promise<ManualSettlementDTO> {
  if (input.fromUserId === input.toUserId) throw new AppError("You can't settle up with yourself");
  if (input.amountCents <= 0) throw new AppError("Settle-up amount must be positive");
  await Promise.all([
    ensureMembership(input.groupId, input.fromUserId),
    ensureMembership(input.groupId, input.toUserId),
  ]);
  const currency = await groupCurrency(input.groupId);
  const [row] = await db
    .insert(schema.manualSettlements)
    .values({
      groupId: input.groupId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amountCents: input.amountCents,
      currency,
      note: input.note ?? null,
    })
    .returning({ id: schema.manualSettlements.id });
  return toDTO(await load(row!.id));
}

/** Recipient confirms → offsetting settlement expense so balances net down. */
export async function confirmManualSettlement(
  id: string,
  byUserId: string,
): Promise<ManualSettlementDTO> {
  const m = await load(id);
  if (m.toUserId !== byUserId) throw new AppError("Only the recipient can confirm this settle-up", 403);
  if (m.status !== "pending") return toDTO(m); // already handled

  await db.transaction(async (tx) => {
    // payer=debtor(from), share=creditor(to) — mirrors the on-chain payoff.
    const [e] = await tx
      .insert(schema.expenses)
      .values({
        groupId: m.groupId,
        payerId: m.fromUserId,
        amountCents: m.amountCents,
        currency: m.currency,
        description: m.note ?? "Manual settlement",
        kind: "settlement",
      })
      .returning({ id: schema.expenses.id });
    await tx.insert(schema.expenseShares).values({
      expenseId: e!.id,
      userId: m.toUserId,
      amountCents: m.amountCents,
    });
    await tx
      .update(schema.manualSettlements)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(eq(schema.manualSettlements.id, id));
  });
  const { syncActiveSettlementWithBalances } = await import("./settlements.js");
  await syncActiveSettlementWithBalances(m.groupId);
  return toDTO(await load(id));
}

/** Recipient rejects → mark rejected, no balance change. */
export async function rejectManualSettlement(
  id: string,
  byUserId: string,
): Promise<ManualSettlementDTO> {
  const m = await load(id);
  if (m.toUserId !== byUserId) throw new AppError("Only the recipient can reject this settle-up", 403);
  if (m.status === "pending") {
    await db
      .update(schema.manualSettlements)
      .set({ status: "rejected" })
      .where(eq(schema.manualSettlements.id, id));
  }
  return toDTO(await load(id));
}

export async function getManualSettlement(id: string): Promise<ManualSettlementDTO> {
  return toDTO(await load(id));
}

/** All settle-ups for a group, most recent first (for the Mini App panel). */
export async function listManualSettlements(groupId: string): Promise<ManualSettlementDTO[]> {
  const rows = await db.query.manualSettlements.findMany({
    where: eq(schema.manualSettlements.groupId, groupId),
    with: { from: true, to: true },
    orderBy: desc(schema.manualSettlements.createdAt),
  });
  return rows.map((r) => toDTO(r as FullManual));
}
