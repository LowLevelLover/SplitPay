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

export function displayName(u: { username: string | null; firstName: string }): string {
  return u.username ? `@${u.username}` : u.firstName;
}
