import type { SettlementAsset, SettlementDTO, SettlementStatus } from "@split-pay/shared";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { computeBalances } from "./balances.js";
import { minimizeTransactions } from "./settlement.js";
import { toUserDTO } from "./users.js";
import { escrowProvider, type DepositInstruction, type EscrowPlan } from "./ton/index.js";
import type { Settlement, SettlementTransfer, User } from "../db/schema.js";

type FullSettlement = Settlement & {
  transfers: (SettlementTransfer & { from: User; to: User })[];
  agreements: { userId: string }[];
};

const OPEN: SettlementStatus[] = ["proposed", "agreed", "deployed"];

function toSettlementDTO(s: FullSettlement): SettlementDTO {
  const involved = new Map<string, User>();
  for (const t of s.transfers) {
    involved.set(t.from.id, t.from);
    involved.set(t.to.id, t.to);
  }
  return {
    id: s.id,
    groupId: s.groupId,
    status: s.status as SettlementStatus,
    asset: s.asset as SettlementAsset,
    contractAddress: s.contractAddress,
    createdAt: s.createdAt.toISOString(),
    transfers: s.transfers.map((t) => ({
      id: t.id,
      from: toUserDTO(t.from),
      to: toUserDTO(t.to),
      amountCents: t.amountCents,
      paid: t.paid,
      txHash: t.txHash,
    })),
    involved: [...involved.values()].map(toUserDTO),
    agreedUserIds: s.agreements.map((a) => a.userId),
  };
}

async function load(settlementId: string): Promise<FullSettlement> {
  const s = await db.query.settlements.findFirst({
    where: eq(schema.settlements.id, settlementId),
    with: { transfers: { with: { from: true, to: true } }, agreements: true },
  });
  if (!s) throw new AppError("Settlement not found", 404);
  return s as FullSettlement;
}

async function findOpen(groupId: string): Promise<FullSettlement | null> {
  const s = await db.query.settlements.findFirst({
    where: and(eq(schema.settlements.groupId, groupId), inArray(schema.settlements.status, OPEN)),
    with: { transfers: { with: { from: true, to: true } }, agreements: true },
  });
  return (s as FullSettlement) ?? null;
}

export async function getActiveSettlement(groupId: string): Promise<SettlementDTO | null> {
  const s = await findOpen(groupId);
  return s ? toSettlementDTO(s) : null;
}

/** Snapshot the current minimized debt graph into a new settlement. */
export async function createSettlement(
  groupId: string,
  asset: SettlementAsset,
): Promise<SettlementDTO> {
  const existing = await findOpen(groupId);
  if (existing) return toSettlementDTO(existing); // one open settlement at a time

  const balances = await computeBalances(groupId);
  const transfers = minimizeTransactions(balances);
  if (transfers.length === 0) throw new AppError("Nothing to settle — all balances are zero");

  const settlementId = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(schema.settlements)
      .values({ groupId, asset })
      .returning({ id: schema.settlements.id });
    await tx.insert(schema.settlementTransfers).values(
      transfers.map((t) => ({
        settlementId: s!.id,
        fromUserId: t.from.id,
        toUserId: t.to.id,
        amountCents: t.amountCents,
      })),
    );
    return s!.id;
  });

  return toSettlementDTO(await load(settlementId));
}

/** Record a member's "Done". When all involved agree, deploy the escrow. */
export async function agreeSettlement(
  settlementId: string,
  userId: string,
): Promise<SettlementDTO> {
  const s = await load(settlementId);
  if (s.status !== "proposed") return toSettlementDTO(s); // already moving forward

  const involved = new Set(s.transfers.flatMap((t) => [t.fromUserId, t.toUserId]));
  if (!involved.has(userId)) throw new AppError("You are not part of this settlement", 403);

  await db
    .insert(schema.settlementAgreements)
    .values({ settlementId, userId })
    .onConflictDoNothing();

  const agreed = new Set([...s.agreements.map((a) => a.userId), userId]);
  const allAgreed = [...involved].every((id) => agreed.has(id));
  if (allAgreed) await deploy(settlementId);

  return toSettlementDTO(await load(settlementId));
}

async function toPlan(s: FullSettlement): Promise<EscrowPlan> {
  return {
    settlementId: s.id,
    asset: s.asset as SettlementAsset,
    transfers: s.transfers.map((t) => ({
      transferId: t.id,
      fromUserId: t.fromUserId,
      toAddress: t.to.tonAddress ?? null,
      amountCents: t.amountCents,
    })),
  };
}

/** All agreed → deploy escrow, then watch for funding. */
async function deploy(settlementId: string): Promise<void> {
  const s = await load(settlementId);
  await db
    .update(schema.settlements)
    .set({ status: "agreed" })
    .where(eq(schema.settlements.id, settlementId));

  const plan = await toPlan(s);
  const { address } = await escrowProvider.deploy(plan);

  await db
    .update(schema.settlements)
    .set({ status: "deployed", contractAddress: address })
    .where(eq(schema.settlements.id, settlementId));

  escrowProvider.watch(address, plan, {
    onTransferPaid: (transferId, txHash) => {
      void markTransferPaid(transferId, txHash);
    },
    onReleased: () => {
      void markReleased(settlementId);
    },
  });
}

/** Mark one debtor's deposit as received (called by the sim API or on-chain watcher). */
export async function markTransferPaid(transferId: string, txHash: string | null): Promise<void> {
  await db
    .update(schema.settlementTransfers)
    .set({ paid: true, txHash })
    .where(eq(schema.settlementTransfers.id, transferId));

  const transfer = await db.query.settlementTransfers.findFirst({
    where: eq(schema.settlementTransfers.id, transferId),
  });
  if (!transfer) return;

  const remaining = await db.query.settlementTransfers.findMany({
    where: and(
      eq(schema.settlementTransfers.settlementId, transfer.settlementId),
      eq(schema.settlementTransfers.paid, false),
    ),
  });
  if (remaining.length === 0) await markReleased(transfer.settlementId);
}

/** Escrow funded & paid out: close the settlement and clear the debts. */
export async function markReleased(settlementId: string): Promise<void> {
  const s = await load(settlementId);
  if (s.status === "released") return;

  await db.transaction(async (tx) => {
    // Offsetting "settlement" expense per transfer: payer=debtor, share=creditor.
    for (const t of s.transfers) {
      const [e] = await tx
        .insert(schema.expenses)
        .values({
          groupId: s.groupId,
          payerId: t.fromUserId,
          amountCents: t.amountCents,
          currency: s.asset,
          description: "On-chain settlement",
          kind: "settlement",
        })
        .returning({ id: schema.expenses.id });
      await tx.insert(schema.expenseShares).values({
        expenseId: e!.id,
        userId: t.toUserId,
        amountCents: t.amountCents,
      });
    }
    await tx
      .update(schema.settlements)
      .set({ status: "released" })
      .where(eq(schema.settlements.id, settlementId));
  });
}

export async function getSettlement(settlementId: string): Promise<SettlementDTO> {
  return toSettlementDTO(await load(settlementId));
}

/** The deposit the caller (a debtor) must make into the escrow, if any. */
export async function getDepositInstruction(
  settlementId: string,
  userId: string,
): Promise<DepositInstruction | null> {
  const s = await load(settlementId);
  if (!s.contractAddress) return null;
  const t = s.transfers.find((t) => t.fromUserId === userId && !t.paid);
  if (!t) return null;
  return escrowProvider.depositFor(s.contractAddress, t.id, t.amountCents, s.asset as SettlementAsset);
}

/** Mark the caller's own transfer as funded (sim / manual confirmation path). */
export async function confirmCallerDeposit(
  settlementId: string,
  userId: string,
): Promise<SettlementDTO> {
  const s = await load(settlementId);
  if (s.status !== "deployed") throw new AppError("Settlement is not ready for deposits");
  const t = s.transfers.find((t) => t.fromUserId === userId);
  if (!t) throw new AppError("You have nothing to pay in this settlement", 403);
  await markTransferPaid(t.id, null);
  return toSettlementDTO(await load(settlementId));
}

/** Only involved debtors/creditors, plus abort helper. */
export async function cancelStaleProposed(groupId: string): Promise<void> {
  await db
    .update(schema.settlements)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(schema.settlements.groupId, groupId),
        notInArray(schema.settlements.status, ["released", "cancelled"]),
      ),
    );
}
