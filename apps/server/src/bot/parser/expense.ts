import type { ExpenseDraft } from "@split-pay/shared";
import { parseAmountToCents } from "../../lib/money.js";

/** Words we strip out so they don't end up in the description. */
const NOISE = new Set(["paid", "pay", "for", "split", "with", "and", "the", "a", "on"]);

const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "₽": "RUB",
};

/**
 * Parse a free-form expense message into a structured draft.
 * Examples that work:
 *   "paid 40 dinner @ana @bob"
 *   "40.50 for taxi with @ana"
 *   "€25 groceries"
 *
 * Returns null if no amount can be found (i.e. it's not an expense).
 */
export function parseExpense(rawText: string): ExpenseDraft | null {
  const text = rawText.trim();

  // 1. Participants: @mentions (excluding the bot itself is handled upstream).
  const participantUsernames = [...text.matchAll(/@(\w{3,32})/g)].map((m) => m[1]!);

  // 2. Amount + optional currency symbol, e.g. "$40", "40.50", "25€".
  const amountMatch = text.match(/([$€£₽])?\s*(\d+(?:[.,]\d{1,2})?)\s*([$€£₽])?/);
  if (!amountMatch) return null;

  const amountCents = parseAmountToCents(amountMatch[2]!);
  if (amountCents === null) return null;

  const symbol = amountMatch[1] ?? amountMatch[3];
  const currency = symbol ? (CURRENCY_SYMBOLS[symbol] ?? "USD") : "USD";

  // 3. Description = leftover words, minus mentions, amount, and noise words.
  const description =
    text
      .replace(/@\w{3,32}/g, "")
      .replace(amountMatch[0], "")
      .split(/\s+/)
      .filter((w) => w && !NOISE.has(w.toLowerCase()))
      .join(" ")
      .trim() || null;

  return { amountCents, currency, description, participantUsernames };
}
