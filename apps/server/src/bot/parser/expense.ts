// Parses a bot-mention message into a set of operations.
//
//   Split (payer paid a total; a per-participant modifier picks HOW it splits —
//   the modifier is attached to the mention, no space):
//     @ali paid 60000 dinner @bob @carol        equally among all listed (+payer)
//     @ali paid 60000 dinner @bob=20000 @carol   unequally: exact amount owed
//     @ali paid 60000 dinner @bob=50% @carol=50% by percentage
//     @ali paid 60000 hotel  @bob*2 @carol*1     by shares (weights)
//     @ali paid 60000 pizza  @bob+5000 @carol    by adjustment (extra, rest equal)
//     @ali 30000 کباب                            no participants → whole group, equal
//
//   Signed ledger (one outing → one expense with exact shares):
//     @farzin -50000 قورمه, -20000 cola
//     @ali    -10000 کباب,  -30000 ماست
//     @mohammad -40000 pizza, +150000 پرداخت بابت رستوران
//
//   Direct debt (X owes Y):
//     @farzin should pay @ali 50000
//     @mohammad 40000 بدهکار به @farzin

import { parseAmountToCents } from "../../lib/money.js";

export interface LedgerItem {
  amountCents: number; // signed: negative = consumed/owes, positive = paid
  description: string | null;
}
export interface LedgerEntry {
  username: string;
  items: LedgerItem[];
}

export type SplitStrategy = "equal" | "exact" | "percent" | "shares" | "adjustment";

// value's meaning depends on the op's strategy: exact/adjustment → cents
// (adjustment may be negative); percent → percent; shares → weight; equal → unused.
export interface SplitParticipant {
  username: string;
  value: number;
}

export type ParsedOp =
  | { kind: "ledger"; entries: LedgerEntry[]; currency: string }
  | {
      kind: "split";
      payerUsername: string;
      amountCents: number;
      description: string | null;
      strategy: SplitStrategy;
      participants: SplitParticipant[];
      currency: string;
    }
  | {
      kind: "debt";
      fromUsername: string;
      toUsername: string;
      amountCents: number;
      description: string | null;
      currency: string;
    }
  | {
      // A manual off-app payoff: `from` paid `to` (null from = the message sender).
      kind: "settle";
      fromUsername: string | null;
      toUsername: string;
      amountCents: number;
      description: string | null;
      currency: string;
    };

const MENTION = /@([A-Za-z0-9_]{2,32})/g;

// A participant mention with an optional split modifier attached (no space):
//   @ali  @ali=1200  @ali=25%  @ali*2  @ali+500  @ali-500
// Groups: 1=user, 2="="  3=num 4="%", 5=shares-weight, 6=+/-  7=adjustment-num.
const PARTICIPANT =
  /@([A-Za-z0-9_]{2,32})(?:(=)(\d+(?:[.,]\d{1,2})?)(%?)|\*(\d+(?:[.,]\d+)?)|([+-])(\d+(?:[.,]\d{1,2})?))?/g;
const NOISE = new Set(["paid", "pay", "for", "split", "the", "a", "on", "پرداخت", "بابت", "به", "و"]);

/** Persian/Arabic digits + separators → ASCII. */
function normalize(text: string): string {
  const map: Record<string, string> = {
    "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    "٫": ".", "٬": "", "،": ",",
  };
  return text.replace(/[۰-۹٠-٩٫٬،]/g, (c) => map[c] ?? c);
}

function detectCurrency(text: string): string {
  const t = text.toLowerCase();
  if (/تومان|تومن|ریال|irt|toman|rial/.test(t)) return "IRT";
  if (/usdt|tether|دلار/.test(t)) return "USDT";
  if (/\bton\b|gram|تون/.test(t)) return "TON";
  return "IRT";
}

function mentions(line: string): string[] {
  return [...line.matchAll(MENTION)].map((m) => m[1]!);
}

/** First bare number in a line → cents (unsigned). */
function firstAmount(line: string): number | null {
  const m = line.replace(MENTION, " ").match(/-?\d+(?:\.\d{1,2})?/);
  return m ? parseAmountToCents(m[0].replace("-", "")) : null;
}

/** Strip mentions, currency words, signs, and numbers → clean description. */
function cleanDescription(text: string): string | null {
  const words = text
    .replace(MENTION, " ")
    .replace(/[+-]?\d+(?:\.\d{1,2})?/g, " ")
    .replace(/تومان|تومن|ریال|usdt|tether|ton|gram|تون|should\s+pay|بدهکار|settled|repaid|paid\s+back|settle\s*up|تسویه|رد\s+کرد/gi, " ")
    .split(/[\s,]+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()));
  return words.length ? words.join(" ") : null;
}

function isDebtLine(line: string): boolean {
  return (/should\s+pay/i.test(line) || /بدهکار/.test(line)) && mentions(line).length >= 2;
}

// A manual settle-up: "settled/repaid/paid back @x N" or Persian "تسویه".
const SETTLE_RE = /\bsettled\b|\brepaid\b|paid\s+back|settle(?:d|s)?\s*up|تسویه|رد\s+کرد/i;
function isSettleLine(line: string): boolean {
  return SETTLE_RE.test(line) && mentions(line).length >= 1 && firstAmount(line) !== null;
}

// One mention → sender paid that person; two → `from` paid `to`.
function parseSettleLine(line: string, currency: string): Extract<ParsedOp, { kind: "settle" }> | null {
  const ms = mentions(line);
  const amount = firstAmount(line);
  if (amount === null || ms.length === 0) return null;
  return {
    kind: "settle",
    fromUsername: ms.length >= 2 ? ms[0]! : null,
    toUsername: ms.length >= 2 ? ms[1]! : ms[0]!,
    amountCents: amount,
    description: cleanDescription(line),
    currency,
  };
}

// A ledger uses STANDALONE signed items (`@ali -500 kabab`). A split modifier is
// attached to a mention (`@ali-500`) and must NOT be read as a ledger sign, so we
// require the sign to follow a start/space/comma.
function hasStandaloneSign(line: string): boolean {
  return /(?:^|[\s,])[+-]\s*\d/.test(line);
}

// A ledger needs consumption (a standalone -amount). A message with only +amounts
// is just "someone paid" → a split, so trailing @mentions become participants.
function hasStandaloneNegative(line: string): boolean {
  return /(?:^|[\s,])-\s*\d/.test(line);
}

function parseLedgerEntry(line: string): LedgerEntry | null {
  const who = mentions(line)[0];
  if (!who) return null;
  // Drop the leading @mention, split the rest into comma-separated items.
  const rest = line.replace(new RegExp(`@${who}`, "i"), "").trim();
  const items: LedgerItem[] = [];
  for (const chunk of rest.split(",")) {
    const m = chunk.match(/([+-])\s*(\d+(?:\.\d{1,2})?)/);
    if (!m) continue;
    const cents = parseAmountToCents(m[2]!);
    if (cents === null) continue;
    items.push({
      amountCents: m[1] === "-" ? -cents : cents,
      description: cleanDescription(chunk),
    });
  }
  return items.length ? { username: who, items } : null;
}

function parseDebtLine(line: string, currency: string): Extract<ParsedOp, { kind: "debt" }> | null {
  const [from, to] = mentions(line);
  const amount = firstAmount(line);
  if (!from || !to || amount === null) return null;
  return { kind: "debt", fromUsername: from, toUsername: to, amountCents: amount, description: cleanDescription(line), currency };
}

type RawParticipant = SplitParticipant & { kind: SplitStrategy | "none" };

/** Every @mention on a line plus its attached modifier, in order. */
function parseParticipants(line: string): RawParticipant[] {
  const out: RawParticipant[] = [];
  for (const m of line.matchAll(PARTICIPANT)) {
    const username = m[1]!;
    if (m[2] === "=") {
      if (m[4] === "%") out.push({ username, kind: "percent", value: Number(m[3]!.replace(",", ".")) });
      else out.push({ username, kind: "exact", value: parseAmountToCents(m[3]!) ?? 0 });
    } else if (m[5] != null) {
      out.push({ username, kind: "shares", value: Number(m[5].replace(",", ".")) });
    } else if (m[6]) {
      const cents = parseAmountToCents(m[7]!) ?? 0;
      out.push({ username, kind: "adjustment", value: m[6] === "-" ? -cents : cents });
    } else {
      out.push({ username, kind: "none", value: 0 });
    }
  }
  return out;
}

function parseSplitLine(line: string, currency: string): Extract<ParsedOp, { kind: "split" }> | null {
  const all = parseParticipants(line);
  const payer = all[0]?.username;
  if (!payer) return null;
  const rest = all.slice(1); // the payer's leading mention isn't a participant on its own

  // Strategy is inferred from which modifier family the participants use.
  let strategy: SplitStrategy = "equal";
  if (rest.some((p) => p.kind === "percent")) strategy = "percent";
  else if (rest.some((p) => p.kind === "shares")) strategy = "shares";
  else if (rest.some((p) => p.kind === "exact")) strategy = "exact";
  else if (rest.some((p) => p.kind === "adjustment")) strategy = "adjustment";

  // Total = the bare amount, once mentions+modifiers are stripped out.
  const residual = line.replace(PARTICIPANT, " ");
  let amount = firstAmount(residual);
  // "Unequally" with no stated total: the total is the sum of the exact amounts.
  if (amount === null && strategy === "exact")
    amount = rest.reduce((a, p) => a + (p.kind === "exact" ? p.value : 0), 0);
  if (amount === null || amount <= 0) return null;

  return {
    kind: "split",
    payerUsername: payer,
    amountCents: amount,
    description: cleanDescription(residual),
    strategy,
    participants: rest.map((p) => ({ username: p.username, value: p.value })),
    currency,
  };
}

/**
 * Parse a full message (already stripped of the bot @mention upstream is fine,
 * but we ignore unknown @mentions anyway). Returns the operations to apply,
 * grouping all signed-ledger lines into ONE ledger op (a single outing).
 */
export function parseMessage(rawText: string): ParsedOp[] {
  const text = normalize(rawText);
  const currency = detectCurrency(text);
  const ops: ParsedOp[] = [];
  const ledgerEntries: LedgerEntry[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && mentions(l).length > 0);
  // Signed lines are a ledger only when the message records consumption somewhere.
  const isLedger = lines.some(hasStandaloneNegative);

  for (const line of lines) {
    if (isSettleLine(line)) {
      const op = parseSettleLine(line, currency);
      if (op) ops.push(op);
    } else if (isDebtLine(line)) {
      const op = parseDebtLine(line, currency);
      if (op) ops.push(op);
    } else if (isLedger && hasStandaloneSign(line)) {
      const entry = parseLedgerEntry(line);
      if (entry) ledgerEntries.push(entry);
    } else {
      const op = parseSplitLine(line, currency);
      if (op) ops.push(op);
    }
  }

  if (ledgerEntries.length) ops.push({ kind: "ledger", entries: ledgerEntries, currency });
  return ops;
}
