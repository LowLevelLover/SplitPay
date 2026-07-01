import { z } from "zod";

/**
 * Zod schemas = the API request contract, validated at the server boundary
 * and reusable by the client for optimistic checks.
 */

/** Body for POST /api/expenses (creating an expense from the Mini App). */
export const createExpenseSchema = z.object({
  groupId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).default("USD"),
  description: z.string().max(200).nullish(),
  payerId: z.string().min(1),
  participantIds: z.array(z.string().min(1)).min(1),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

/** A structured expense extracted by the bot's regex parser. */
export const expenseDraftSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).default("USD"),
  description: z.string().nullable(),
  /** Telegram usernames (without @) mentioned as participants; empty = whole group. */
  participantUsernames: z.array(z.string()),
});

export type ExpenseDraft = z.infer<typeof expenseDraftSchema>;
