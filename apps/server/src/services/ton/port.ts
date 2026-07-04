import type { SettlementAsset } from "@split-pay/shared";

// The single seam for on-chain settlement. The app depends on this interface,
// never a concrete TON lib. `sim` runs the whole flow off-chain for local dev;
// `ton` deploys a real escrow on testnet (see ./real.ts). Swap in ./index.ts.

export interface EscrowTransferPlan {
  transferId: string;
  fromUserId: string;
  /** Creditor's connected TON wallet; null if they haven't connected yet. */
  toAddress: string | null;
  amountCents: number;
}

export interface EscrowPlan {
  settlementId: string;
  asset: SettlementAsset;
  transfers: EscrowTransferPlan[];
}

/** What a debtor's wallet needs to fund their part (TON Connect / deep link). */
export interface DepositInstruction {
  address: string; // escrow to send to
  amountNano: string; // base units (nanotons for TON, 1e6 for USDT)
  comment: string; // attribution (transfer id)
  asset: SettlementAsset;
}

export interface WatchHooks {
  onTransferPaid(transferId: string, txHash: string | null): void;
  onReleased(): void;
}

export interface EscrowProvider {
  readonly kind: "sim" | "ton";
  /** Deploy the escrow for this plan; returns its on-chain address. */
  deploy(plan: EscrowPlan): Promise<{ address: string }>;
  /** Build the payment a specific debtor must make into the escrow. */
  depositFor(
    address: string,
    transferId: string,
    amountCents: number,
    asset: SettlementAsset,
  ): DepositInstruction;
  /** Begin watching for funding; drives the release + settlement callbacks. */
  watch(address: string, plan: EscrowPlan, hooks: WatchHooks): void;
  /** Live on-chain state of the escrow account. */
  status(address: string, plan: EscrowPlan): Promise<{ deployed: boolean; balanceNano: string }>;
}

/** Minor units (cents ×100) → on-chain base units. */
export function centsToBaseUnits(amountCents: number, asset: SettlementAsset): string {
  const decimals = asset === "TON" ? 9 : 6; // USDT jetton = 6 decimals
  // units = cents / 100; base = units * 10^decimals
  return (BigInt(amountCents) * 10n ** BigInt(decimals) / 100n).toString();
}
