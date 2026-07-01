// Parses a bot-mention message into a set of operations. Three templates,
// which may be mixed in one message (see parseMessage):
//
//   Signed ledger (one outing → one expense with exact shares):
//     @farzin -50000 قورمه, -20000 cola
//     @ali    -10000 کباب,  -30000 ماست
//     @mohammad -40000 pizza, +150000 پرداخت بابت رستوران
//
//   Equal split (payer paid, split evenly among group or named people):
//     @farzin paid 60000 dinner @ali @bob
//     @farzin 30000 کباب                     (no sign, no keyword)
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

export type ParsedOp =
  | { kind: "ledger"; entries: LedgerEntry[]; currency: string }
  | {
      kind: "equal";
      payerUsername: string;
      amountCents: number;
      description: string | null;
      participantUsernames: string[];
      currency: string;
    }
  | {
      kind: "debt";
      fromUsername: string;
      toUsername: string;
      amountCents: number;
      description: string | null;
      currency: string;
    };

const MENTION = /@([A-Za-z0-9_]{2,32})/g;
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
  const m = line.match(/-?\d+(?:\.\d{1,2})?/);
  return m ? parseAmountToCents(m[0].replace("-", "")) : null;
}

/** Strip mentions, currency words, signs, and numbers → clean description. */
function cleanDescription(text: string): string | null {
  const words = text
    .replace(MENTION, " ")
    .replace(/[+-]?\d+(?:\.\d{1,2})?/g, " ")
    .replace(/تومان|تومن|ریال|usdt|tether|gram|should\s+pay|بدهکار/gi, " ")
    .split(/[\s,]+/)
    .filter((w) => w && !NOISE.has(w.toLowerCase()));
  return words.length ? words.join(" ") : null;
}

function isDebtLine(line: string): boolean {
  return (/should\s+pay/i.test(line) || /بدهکار/.test(line)) && mentions(line).length >= 2;
}

function hasSignedAmount(line: string): boolean {
  return /[+-]\s*\d/.test(line);
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

function parseEqualLine(line: string, currency: string): Extract<ParsedOp, { kind: "equal" }> | null {
  const ms = mentions(line);
  const payer = ms[0];
  const amount = firstAmount(line);
  if (!payer || amount === null) return null;
  return { kind: "equal", payerUsername: payer, amountCents: amount, description: cleanDescription(line), participantUsernames: ms.slice(1), currency };
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

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || mentions(line).length === 0) continue;

    if (isDebtLine(line)) {
      const op = parseDebtLine(line, currency);
      if (op) ops.push(op);
    } else if (hasSignedAmount(line)) {
      const entry = parseLedgerEntry(line);
      if (entry) ledgerEntries.push(entry);
    } else {
      const op = parseEqualLine(line, currency);
      if (op) ops.push(op);
    }
  }

  if (ledgerEntries.length) ops.push({ kind: "ledger", entries: ledgerEntries, currency });
  return ops;
}
