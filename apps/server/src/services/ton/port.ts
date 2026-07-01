import type { SettlementSuggestion } from "@split-pay/shared";

// The single seam for future TON settlement. App depends on this interface,
// never a concrete TON lib. Add an impl + swap ./index.ts to go on-chain.
export interface SettlementProvider {
  readonly kind: "manual" | "ton";

  /**
   * Produce a payment instruction for a suggested transfer. Today this is
   * just human-readable text; a TON provider would return a ton:// deep link
   * or a prepared transaction for the Mini App to sign.
   */
  prepare(suggestion: SettlementSuggestion, currency: string): Promise<SettlementInstruction>;
}

export interface SettlementInstruction {
  kind: "manual" | "ton";
  /** Human-readable summary shown in the UI. */
  label: string;
  /** Optional deep link / payment URI (populated by the TON provider). */
  uri?: string;
}
