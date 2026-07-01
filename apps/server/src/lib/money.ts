/**
 * Money helpers. All amounts are integer cents; formatting is display-only.
 */

/** Split `totalCents` into `n` parts that sum EXACTLY to the total. */
export function splitEvenly(totalCents: number, n: number): number[] {
  if (n <= 0) throw new Error("Cannot split among zero participants");
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  // Distribute the leftover cents one-by-one to the first `remainder` shares.
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * Split `totalCents` proportionally to `weights`, summing EXACTLY to the total
 * (largest-remainder rounding). Used for percent / proportional splits.
 */
export function splitByWeights(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum <= 0) return splitEvenly(totalCents, weights.length);

  const raw = weights.map((w) => (totalCents * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = totalCents - floors.reduce((a, f) => a + f, 0);
  // Hand out the leftover cents to the largest fractional parts first.
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i]!++;
    remainder--;
  }
  return result;
}

/** Parse a human amount string ("40", "40.50", "40,50") into integer cents. */
export function parseAmountToCents(raw: string): number | null {
  const normalized = raw.replace(",", ".").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

// Currencies without minor units — show as whole numbers with grouping.
const WHOLE = new Set(["IRT", "IRR", "TOMAN"]);

/** Format integer cents for display; currency-aware (IRT → "50,000"). */
export function formatCents(cents: number, currency?: string): string {
  const value = Math.abs(cents) / 100;
  if (currency && WHOLE.has(currency.toUpperCase())) {
    return Math.round(value).toLocaleString("en-US");
  }
  return value.toFixed(2);
}
