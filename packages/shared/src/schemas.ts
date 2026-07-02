import { z } from "zod";

/**
 * Zod schemas = the API request contract, validated at the server boundary
 * and reusable by the client for optimistic checks.
 */

/** How an expense's total is divided among participants. */
export const splitInputSchema = z.discriminatedUnion("strategy", [
  z.object({
    strategy: z.literal("equal"),
    participantIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    strategy: z.literal("percent"),
    shares: z.array(z.object({ userId: z.string().min(1), percent: z.number().positive() })).min(1),
  }),
  z.object({
    strategy: z.literal("exact"),
    shares: z
      .array(z.object({ userId: z.string().min(1), amountCents: z.number().int().nonnegative() }))
      .min(1),
  }),
  // Proportional integer/decimal weights (e.g. 2 nights → 2, family of 3 → 3).
  z.object({
    strategy: z.literal("shares"),
    shares: z.array(z.object({ userId: z.string().min(1), shares: z.number().positive() })).min(1),
  }),
  // Per-person extra (signed); the remainder after adjustments is split equally.
  z.object({
    strategy: z.literal("adjustment"),
    shares: z.array(z.object({ userId: z.string().min(1), adjustmentCents: z.number().int() })).min(1),
  }),
]);

export type SplitInput = z.infer<typeof splitInputSchema>;

/** Body for POST /api/expenses (creating an expense from the Mini App). */
export const createExpenseSchema = z.object({
  groupId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().min(1).max(8).default("IRT"),
  description: z.string().max(200).nullish(),
  payerId: z.string().min(1),
  split: splitInputSchema,
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** Persist the caller's connected TON wallet address. */
export const saveWalletSchema = z.object({
  tonAddress: z.string().min(1).max(100),
});

export type SaveWalletInput = z.infer<typeof saveWalletSchema>;

/** Open a settlement for a group's current balances. */
export const createSettlementSchema = z.object({
  groupId: z.string().min(1),
  asset: z.enum(["TON", "USDT"]).default("TON"),
});

export type CreateSettlementInput = z.infer<typeof createSettlementSchema>;

/** Record a manual off-app settle-up: caller says they paid `toUserId`. */
export const createManualSettlementSchema = z.object({
  groupId: z.string().min(1),
  toUserId: z.string().min(1),
  amountCents: z.number().int().positive(),
  note: z.string().max(200).nullish(),
});

export type CreateManualSettlementInput = z.infer<typeof createManualSettlementSchema>;
