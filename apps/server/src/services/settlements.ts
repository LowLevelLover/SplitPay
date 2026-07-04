import type {
  EscrowStatusDTO,
  SettlementAsset,
  SettlementDTO,
  SettlementStatus,
} from "@split-pay/shared";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { env } from "../config/env.js";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { computeBalances } from "./balances.js";
import { minimizeTransactions } from "./settlement.js";
import { convert } from "./prices.js";
import { toUserDTO } from "./users.js";
import {
  centsToBaseUnits,
  escrowProvider,
  type DepositInstruction,
  type EscrowPlan,
} from "./ton/index.js";
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

function transferKey(t: { fromUserId: string; toUserId: string; amountCents: number }): string {
  return `${t.fromUserId}:${t.toUserId}:${t.amountCents}`;
}

export async function getActiveSettlement(groupId: string): Promise<SettlementDTO | null> {
  const s = await findOpen(groupId);
  return s ? await toSettlementDTO(s) : null;
}

/**
 * Pairwise net debt payer→each receiver, straight from expenses/shares (other
 * members excluded). Positive = payer owes that receiver; in group currency.
 */
async function pairwiseNets(
  groupId: string,
  payerId: string,
  toUserIds: string[],
): Promise<{ toUserId: string; amountCents: number }[]> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, groupId),
    with: { members: true, expenses: { with: { shares: true } } },
  });
  if (!group) throw new AppError("Group not found", 404);

  const memberIds = new Set(group.members.map((m) => m.userId));
  for (const id of toUserIds) {
    if (!memberIds.has(id)) throw new AppError("Receiver is not a group member", 400);
  }
  const receivers = new Set(toUserIds.filter((id) => id !== payerId));

  const toGroupCents = async (amountCents: number, currency: string) =>
    Math.round((await convert(amountCents / 100, currency, group.currency)) * 100);

  const net = new Map<string, number>(); // receiverId → cents payer owes them
  const add = (receiverId: string, delta: number) =>
    net.set(receiverId, (net.get(receiverId) ?? 0) + delta);

  for (const e of group.expenses) {
    for (const s of e.shares) {
      if (s.userId === e.payerId) continue; // own share = no debt
      // A share held by U on an expense paid by P means U owes P that amount.
      if (s.userId === payerId && receivers.has(e.payerId)) {
        add(e.payerId, await toGroupCents(s.amountCents, e.currency));
      } else if (e.payerId === payerId && receivers.has(s.userId)) {
        add(s.userId, -(await toGroupCents(s.amountCents, e.currency)));
      }
    }
  }

  return [...net.entries()]
    .filter(([, cents]) => cents > 0)
    .map(([toUserId, amountCents]) => ({ toUserId, amountCents }));
}

/**
 * Snapshot debts into a new settlement. Without opts: the group's minimized
 * graph. With `toUserIds`: scoped — `payerId` pays each listed receiver their
 * pairwise net debt (one escrow, one payer → N receivers).
 */
export async function createSettlement(
  groupId: string,
  asset: SettlementAsset,
  opts?: { payerId?: string; toUserIds?: string[] },
): Promise<SettlementDTO> {
  const existing = await findOpen(groupId);
  if (existing) return await toSettlementDTO(existing); // one open settlement at a time

  let rows: { fromUserId: string; toUserId: string; amountCents: number }[];
  if (opts?.toUserIds?.length) {
    if (!opts.payerId) throw new AppError("A scoped settlement needs a payer");
    const payerId = opts.payerId;
    const nets = await pairwiseNets(groupId, payerId, opts.toUserIds);
    if (nets.length === 0) throw new AppError("nothing to settle with the selected members");
    rows = nets.map((n) => ({ fromUserId: payerId, toUserId: n.toUserId, amountCents: n.amountCents }));
  } else {
    const transfers = minimizeTransactions(await computeBalances(groupId));
    if (transfers.length === 0) throw new AppError("Nothing to settle — all balances are zero");
    rows = transfers.map((t) => ({
      fromUserId: t.from.id,
      toUserId: t.to.id,
      amountCents: t.amountCents,
    }));
  }

  const settlementId = await db.transaction(async (tx) => {
    const [s] = await tx
      .insert(schema.settlements)
      .values({ groupId, asset })
      .returning({ id: schema.settlements.id });
    await tx
      .insert(schema.settlementTransfers)
      .values(rows.map((r) => ({ settlementId: s!.id, ...r })));
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
  // Receivers get paid on-chain, so they need a saved address before agreeing.
  // Payers deposit from any wallet — no address required.
  if (escrowProvider.kind !== "sim") {
    const receiving = s.transfers.find((t) => t.toUserId === userId);
    if (receiving && !receiving.to.tonAddress) {
      throw new AppError("Save your TON address before agreeing — payouts go on-chain", 400);
    }
  }

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

/**
 * A confirmed off-app payment changes the ledger immediately. Keep any open
 * escrow aligned with that current ledger without writing extra settlement
 * expenses, otherwise manual payments would be counted twice.
 */
export async function syncActiveSettlementWithBalances(groupId: string): Promise<void> {
  const s = await findOpen(groupId);
  if (!s) return;

  // A scoped settlement (one payer → chosen receivers) must keep its scope:
  // recompute only that payer's pairwise nets to its existing receivers, never
  // reshape into the whole-group graph. Detect scope by a single distinct payer.
  const payers = new Set(s.transfers.map((t) => t.fromUserId));
  let transfers: { from: { id: string }; to: { id: string }; amountCents: number }[];
  if (payers.size === 1) {
    const payerId = [...payers][0]!;
    const receiverIds = [...new Set(s.transfers.map((t) => t.toUserId))];
    const nets = await pairwiseNets(groupId, payerId, receiverIds);
    transfers = nets.map((n) => ({ from: { id: payerId }, to: { id: n.toUserId }, amountCents: n.amountCents }));
  } else {
    transfers = minimizeTransactions(await computeBalances(groupId));
  }

  await db.transaction(async (tx) => {
    if (transfers.length === 0) {
      await tx
        .update(schema.settlements)
        .set({ status: "released" })
        .where(eq(schema.settlements.id, s.id));
      return;
    }

    const paidByKey = new Map<string, SettlementTransfer[]>();
    for (const t of s.transfers) {
      if (!t.paid) continue;
      const key = transferKey(t);
      paidByKey.set(key, [...(paidByKey.get(key) ?? []), t]);
    }

    await tx.delete(schema.settlementTransfers).where(eq(schema.settlementTransfers.settlementId, s.id));
    await tx.insert(schema.settlementTransfers).values(
      transfers.map((t) => {
        const key = `${t.from.id}:${t.to.id}:${t.amountCents}`;
        const paid = paidByKey.get(key)?.shift();
        return {
          settlementId: s.id,
          fromUserId: t.from.id,
          toUserId: t.to.id,
          amountCents: t.amountCents,
          paid: !!paid,
          txHash: paid?.txHash ?? null,
        };
      }),
    );

    if (s.status === "proposed") {
      await tx.delete(schema.settlementAgreements).where(eq(schema.settlementAgreements.settlementId, s.id));
    }
  });
}

export async function getSettlement(settlementId: string): Promise<SettlementDTO> {
  return await toSettlementDTO(await load(settlementId));
}

/** Provider on-chain state + DB funding state, for the escrow progress UI. */
export async function getEscrowStatus(settlementId: string): Promise<EscrowStatusDTO> {
  const s = await load(settlementId);
  const plan = await toPlan(s);
  const sim = escrowProvider.kind === "sim";

  const requiredNano = plan.transfers
    .reduce((sum, t) => sum + BigInt(centsToBaseUnits(t.amountCents, plan.asset)), 0n)
    .toString();
  const fundedTransferIds = s.transfers.filter((t) => t.paid).map((t) => t.id);

  const base = {
    settlementId: s.id,
    network: sim ? ("sim" as const) : env.TON_NETWORK,
    requiredNano,
    fundedTransferIds,
    released: s.status === "released",
  };

  if (!s.contractAddress) {
    return { ...base, address: null, deployed: false, balanceNano: "0", explorerUrl: null };
  }

  const onChain = await escrowProvider.status(s.contractAddress, plan);
  // Sim has no chain balance — report funded transfers so the progress bar works.
  const funded = new Set(fundedTransferIds);
  const balanceNano = sim
    ? plan.transfers
        .filter((t) => funded.has(t.transferId))
        .reduce((sum, t) => sum + BigInt(centsToBaseUnits(t.amountCents, plan.asset)), 0n)
        .toString()
    : onChain.balanceNano;
  const explorerHost = env.TON_NETWORK === "mainnet" ? "tonviewer.com" : "testnet.tonviewer.com";

  return {
    ...base,
    address: s.contractAddress,
    deployed: onChain.deployed,
    balanceNano,
    explorerUrl: sim ? null : `https://${explorerHost}/${s.contractAddress}`,
  };
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
  if (escrowProvider.kind !== "sim") {
    throw new AppError("On-chain deposits are confirmed by the TON watcher", 409);
  }

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
