// Currencies without minor units — show as whole numbers with grouping.
const WHOLE = new Set(["IRT", "IRR", "TOMAN"]);

/** Format integer cents for display; currency- and locale-aware (fa-IR → Persian digits). */
export function formatCents(cents: number, currency?: string, locale = "en-US"): string {
  const value = Math.abs(cents) / 100;
  if (currency && WHOLE.has(currency.toUpperCase())) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
  }
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Format a nanoton string as TON with 2–4 decimals. */
export function formatTon(nano: string, locale = "en-US"): string {
  const value = Number(nano) / 1e9;
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function displayName(u: { username: string | null; firstName: string }): string {
  return u.username ? `@${u.username}` : u.firstName;
}
