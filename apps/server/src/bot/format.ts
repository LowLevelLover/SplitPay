// fa-IR display formatting, bot-only (lib/money.ts stays locale-neutral).
const WHOLE = new Set(["IRT", "IRR", "TOMAN"]);

/** Format integer cents with Persian digits & grouping (display only). */
export function fmtAmount(cents: number, currency?: string): string {
  const value = Math.abs(cents) / 100;
  const whole = !!currency && WHOLE.has(currency.toUpperCase());
  return new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(whole ? Math.round(value) : value);
}

/** Persian label for a currency code; crypto codes stay as-is. */
export function currencyLabel(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "IRT" || c === "TOMAN") return "تومان";
  if (c === "IRR") return "ریال";
  return currency;
}

export const fmtMoney = (cents: number, currency: string): string =>
  `${fmtAmount(cents, currency)} ${currencyLabel(currency)}`;
