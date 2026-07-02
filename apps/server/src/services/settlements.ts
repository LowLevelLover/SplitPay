import type { SettlementAsset, SettlementDTO, SettlementStatus } from "@split-pay/shared";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { computeBalances } from "./balances.js";
import { minimizeTransactions } from "./settlement.js";
import { convert } from "./prices.js";
import { toUserDTO } from "./users.js";
import { escrowProvider, type DepositInstruction, type EscrowPlan } from "./ton/index.js";
import type { Settlement, SettlementTransfer, User } from "../db/schema.js";

type FullSettlement = Settlement & {
  transfers: (SettlementTransfer & { from: User; to: User })[];
  agreements: { userId: string }[];
};

const OPEN: SettlementStatus[] = ["proposed", "agreed", "deployed"];

async function groupCurrency(groupId: string): Promise<string> {
  const g = await db.query.groups.findFirst({ where: eq(schema.groups.id, groupId) });
  return g?.currency ?? "IRT";
}

// Debts live in the group's fiat currency (integer cents). Convert to the
// settlement asset's minor units (2dp) at live market prices — for display and
// on-chain amounts alike. The DB stays fiat so balances still net to zero.
async function toAssetCents(
  amountCents: number,
  currency: string,
  asset: SettlementAsset,
): Promise<number> {
  const units = await convert(amountCents / 100, currency, asset);
  return Math.round(units * 100);
}

async function toSettlementDTO(s: FullSettlement): Promise<SettlementDTO> {
  const currency = await groupCurrency(s.groupId);
  const involved = new Map<string, User>();
  for (const t of s.transfers) {
    involved.set(t.from.id, t.from);
    involved.set(t.to.id, t.to);
  }
  const transfers = await Promise.all(
    s.transfers.map(async (t) => ({
      id: t.id,
      from: toUserDTO(t.from),
      to: toUserDTO(t.to),
      amountCents: await toAssetCents(t.amountCents, currency, s.asset as SettlementAsset),
      paid: t.paid,
      txHash: t.txHash,
    })),
  );
  return {
    id: s.id,
    groupId: s.groupId,
    status: s.status as SettlementStatus,
    asset: s.asset as SettlementAsset,
    contractAddress: s.contractAddress,
    createdAt: s.createdAt.toISOString(),
    transfers,
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
  return s ? await toSettlementDTO(s) : null;
}

/** Snapshot the current minimized debt graph into a new settlement. */
export async function createSettlement(
  groupId: string,
  asset: SettlementAsset,
): Promise<SettlementDTO> {
  const existing = await findOpen(groupId);
  if (existing) return await toSettlementDTO(existing); // one open settlement at a time

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

  return await toSettlementDTO(await load(settlementId));
}

/** Record a member's "Done". When all involved agree, deploy the escrow. */
export async function agreeSettlement(
  settlementId: string,
  userId: string,
): Promise<SettlementDTO> {
  const s = await load(settlementId);
  if (s.status !== "proposed") return await toSettlementDTO(s); // already moving forward

  const involved = new Set(s.transfers.flatMap((t) => [t.fromUserId, t.toUserId]));
  if (!involved.has(userId)) throw new AppError("You are not part of this settlement", 403);

  await db
    .insert(schema.settlementAgreements)
    .values({ settlementId, userId })
    .onConflictDoNothing();

  const agreed = new Set([...s.agreements.map((a) => a.userId), userId]);
  const allAgreed = [...involved].every((id) => agreed.has(id));
  if (allAgreed) await deploy(settlementId);

  return await toSettlementDTO(await load(settlementId));
}

async function toPlan(s: FullSettlement): Promise<EscrowPlan> {
  const currency = await groupCurrency(s.groupId);
  const asset = s.asset as SettlementAsset;
  const transfers = await Promise.all(
    s.transfers.map(async (t) => ({
      transferId: t.id,
      fromUserId: t.fromUserId,
      toAddress: t.to.tonAddress ?? null,
      amountCents: await toAssetCents(t.amountCents, currency, asset),
    })),
  );
  return { settlementId: s.id, asset, transfers };
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
  return await toSettlementDTO(await load(settlementId));
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
  const asset = s.asset as SettlementAsset;
  const cents = await toAssetCents(t.amountCents, await groupCurrency(s.groupId), asset);
  return escrowProvider.depositFor(s.contractAddress, t.id, cents, asset);
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
  return await toSettlementDTO(await load(settlementId));
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
