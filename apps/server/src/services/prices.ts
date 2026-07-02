import { z } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

// Live market prices from swapwallet. Pairs are "<SYM>/<QUOTE>" where QUOTE is
// USDT or IRT, value = price of 1 SYM in QUOTE (e.g. "TON/IRT":"286520").
// USD is treated as USDT. Conversions bridge through USDT.

const responseSchema = z.object({
  status: z.string(),
  result: z.record(z.string(), z.string()),
});

type PriceMap = Record<string, string>;

const TTL_MS = 60_000;
let cache: { at: number; prices: PriceMap } | null = null;

// Coarse monotonic clock: Date.now() is fine here (not in workflow scripts).
async function getPrices(): Promise<PriceMap> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.prices;
  try {
    const res = await fetch(env.PRICES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { result } = responseSchema.parse(await res.json());
    cache = { at: now, prices: result };
    return result;
  } catch (err) {
    if (cache) return cache.prices; // serve stale rather than fail a settlement
    throw new AppError(`Couldn't fetch market prices: ${err instanceof Error ? err.message : err}`);
  }
}

// USD is our alias for the USDT stablecoin; otherwise just normalize casing.
function norm(currency: string): string {
  const c = currency.toUpperCase();
  return c === "USD" ? "USDT" : c;
}

function rate(prices: PriceMap, pair: string): number {
  const v = prices[pair];
  const n = v == null ? NaN : Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new AppError(`No market price for ${pair}`);
  return n;
}

function toUsdt(amount: number, cur: string, prices: PriceMap): number {
  if (cur === "USDT") return amount;
  if (cur === "IRT") return amount / rate(prices, "USDT/IRT"); // IRT per USDT
  return amount * rate(prices, `${cur}/USDT`);
}

function fromUsdt(usdt: number, cur: string, prices: PriceMap): number {
  if (cur === "USDT") return usdt;
  if (cur === "IRT") return usdt * rate(prices, "USDT/IRT");
  return usdt / rate(prices, `${cur}/USDT`);
}

/** Convert an amount of `from` currency into units of `to`, via live prices. */
export async function convert(amount: number, from: string, to: string): Promise<number> {
  const [f, t] = [norm(from), norm(to)];
  if (f === t) return amount;
  const prices = await getPrices();
  return fromUsdt(toUsdt(amount, f, prices), t, prices);
}
