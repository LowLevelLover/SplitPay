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

/** Parse a human amount string ("40", "40.50", "40,50") into integer cents. */
export function parseAmountToCents(raw: string): number | null {
  const normalized = raw.replace(",", ".").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(parseFloat(normalized) * 100);
}

/** Format integer cents for display, e.g. 4050 -> "40.50". */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}
