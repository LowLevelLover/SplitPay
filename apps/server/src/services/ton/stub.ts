import type { SettlementSuggestion } from "@split-pay/shared";
import { formatCents } from "../../lib/money.js";
import type { SettlementInstruction, SettlementProvider } from "./port.js";

// Today's provider: settlement is off-chain/manual; just describes the transfer.
export const manualSettlementProvider: SettlementProvider = {
  kind: "manual",
  async prepare(suggestion: SettlementSuggestion, currency: string): Promise<SettlementInstruction> {
    const from = suggestion.from.username ?? suggestion.from.firstName;
    const to = suggestion.to.username ?? suggestion.to.firstName;
    return {
      kind: "manual",
      label: `${from} pays ${to} ${formatCents(suggestion.amountCents)} ${currency}`,
    };
  },
};
