import type { SettlementAsset } from "@split-pay/shared";
import {
  centsToBaseUnits,
  type DepositInstruction,
  type EscrowPlan,
  type EscrowProvider,
  type WatchHooks,
} from "./port.js";

// Off-chain simulation: the whole settlement flow works locally with no wallet
// or testnet. "Funding" is driven by the debtor tapping Deposit in the Mini App
// (the API calls markTransferPaid), so watch() is a no-op here.
export const simEscrowProvider: EscrowProvider = {
  kind: "sim",

  async deploy(plan: EscrowPlan): Promise<{ address: string }> {
    return { address: `EQsim_${plan.settlementId.slice(0, 8)}` };
  },

  depositFor(
    address: string,
    transferId: string,
    amountCents: number,
    asset: SettlementAsset,
  ): DepositInstruction {
    return { address, amountNano: centsToBaseUnits(amountCents, asset), comment: transferId, asset };
  },

  watch(_address: string, _plan: EscrowPlan, _hooks: WatchHooks): void {
    // no-op: sim funding is user-driven via the API
  },
};
