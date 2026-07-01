import { manualSettlementProvider } from "./stub.js";
import type { SettlementProvider } from "./port.js";

/**
 * The active settlement provider. Swap this line to go on-chain later:
 *   export const settlementProvider = tonSettlementProvider;
 */
export const settlementProvider: SettlementProvider = manualSettlementProvider;

export type { SettlementProvider, SettlementInstruction } from "./port.js";
