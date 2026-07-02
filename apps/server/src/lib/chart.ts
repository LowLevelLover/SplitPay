// Renders a group's balances + settlement plan to a PNG (for the bot to attach).
// Uses @napi-rs/canvas (prebuilt binary, no native build) and a bundled font so
// Latin + Persian both render regardless of the host's installed fonts.
import type { GroupSummaryDTO, UserDTO } from "@split-pay/shared";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { fileURLToPath } from "node:url";
import { formatCents } from "./money.js";

GlobalFonts.registerFromPath(
  fileURLToPath(new URL("../../assets/PlexArabic.ttf", import.meta.url)),
  "Plex",
);

const FONT = "Plex";
const C = {
  bg: "#0f172a", card: "#1e293b", text: "#e5e7eb", muted: "#94a3b8",
  pos: "#22c55e", neg: "#f87171", axis: "#334155", accent: "#38bdf8",
};

// The bundled font has no emoji glyphs; drop them so titles don't show tofu.
const stripEmoji = (s: string) =>
  s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();

const name = (u: UserDTO) => (u.username ? `@${u.username}` : u.firstName);
const signed = (cents: number, currency: string) =>
  (cents > 0 ? "+" : "−") + formatCents(cents, currency);

/** PNG of net balances (bar chart) + who-pays-whom, sized to the content. */
export function renderSummaryImage(summary: GroupSummaryDTO): Buffer {
  const balances = summary.balances.filter((b) => b.netCents !== 0).sort((a, b) => b.netCents - a.netCents);
  const { suggestions, currency } = summary;
  const title = stripEmoji(summary.group.title || "") || "SplitPay";

  const W = 760;
  const PAD = 36;
  const ROW = 44; // balance row height
  const SROW = 40; // settlement row height
  const headerH = 96;
  const balanceH = balances.length ? balances.length * ROW + 52 : 0;
  const settleH = (suggestions.length || 1) * SROW + 52;
  const H = headerH + balanceH + settleH + PAD;

  const SC = 2; // render at 2x for crisp downscaling in Telegram
  const canvas = createCanvas(W * SC, H * SC);
  const ctx = canvas.getContext("2d");
  ctx.scale(SC, SC);

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.fillStyle = C.text;
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(title, PAD, 48);
  ctx.fillStyle = C.muted;
  ctx.font = `16px ${FONT}`;
  ctx.fillText(`Settle in ${currency}`, PAD, 74);

  let y = headerH;

  // ── Net balances ──────────────────────────────────────────────
  ctx.fillStyle = C.accent;
  ctx.font = `600 15px ${FONT}`;
  if (balances.length) {
    ctx.fillText("NET BALANCES", PAD, y);
    y += 24;

    // Bars share a scale; layout: [name] [amount right-aligned] [bar]
    const maxAbs = Math.max(...balances.map((b) => Math.abs(b.netCents)));
    const barX = 320;
    const barMax = W - PAD - barX;
    ctx.textBaseline = "middle";
    for (const b of balances) {
      const cy = y + ROW / 2;
      const positive = b.netCents > 0;
      const color = positive ? C.pos : C.neg;

      ctx.fillStyle = C.text;
      ctx.font = `17px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillText(name(b.user), PAD, cy);

      ctx.fillStyle = color;
      ctx.font = `600 16px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(signed(b.netCents, currency), barX - 16, cy);

      const w = Math.max(4, (Math.abs(b.netCents) / maxAbs) * barMax);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(barX, cy - 9, w, 18, 6);
      ctx.fill();
      y += ROW;
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    y += 28;
  }

  // ── Who pays whom ─────────────────────────────────────────────
  ctx.fillStyle = C.accent;
  ctx.font = `600 15px ${FONT}`;
  ctx.fillText("WHO PAYS WHOM", PAD, y);
  y += 26;

  ctx.textBaseline = "middle";
  if (suggestions.length === 0) {
    ctx.fillStyle = C.pos;
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText("All settled up!", PAD, y + SROW / 2);
  } else {
    for (const s of suggestions) {
      const cy = y + SROW / 2;
      ctx.fillStyle = C.card;
      ctx.beginPath();
      ctx.roundRect(PAD, cy - SROW / 2 + 4, W - 2 * PAD, SROW - 8, 8);
      ctx.fill();

      ctx.font = `17px ${FONT}`;
      ctx.textAlign = "left";
      ctx.fillStyle = C.neg;
      ctx.fillText(name(s.from), PAD + 16, cy);
      const fromW = ctx.measureText(name(s.from)).width;
      ctx.fillStyle = C.muted;
      ctx.fillText("  →  ", PAD + 16 + fromW, cy);
      const arrowW = ctx.measureText("  →  ").width;
      ctx.fillStyle = C.pos;
      ctx.fillText(name(s.to), PAD + 16 + fromW + arrowW, cy);

      ctx.fillStyle = C.text;
      ctx.font = `600 17px ${FONT}`;
      ctx.textAlign = "right";
      ctx.fillText(`${formatCents(s.amountCents, currency)} ${currency}`, W - PAD - 16, cy);
      y += SROW;
    }
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  return canvas.toBuffer("image/png");
}
