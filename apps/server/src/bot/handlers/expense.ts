import type { SplitPayContext } from "../context.js";
import { InputFile } from "grammy";
import { env } from "../../config/env.js";
import { formatCents } from "../../lib/money.js";
import { AppError } from "../../lib/errors.js";
import { applyParsedOps } from "../../services/expenses.js";
import { getGroupSummary } from "../../services/balances.js";
import { renderSummaryImage } from "../../lib/chart.js";
import type { ParsedOp } from "../parser/expense.js";
import { parseMessage } from "../parser/expense.js";
import { handleSettleOps } from "./settle.js";
import { miniAppKeyboard } from "../keyboard.js";
import { expenseExamples } from "../examples.js";

const name = (u: { username: string | null; firstName: string }) =>
  u.username ? `@${u.username}` : u.firstName;

// On bot mention: parse the message into expense/debt/ledger operations, record
// them, then reply with the updated "who pays whom" summary.
export async function handleExpenseMention(ctx: SplitPayContext): Promise<void> {
  const text = ctx.message?.text;
  if (!text || !ctx.dbGroupId) return;

  // Strip the bot's own @mention so it isn't parsed as a participant.
  const cleaned = text.replace(new RegExp(`@${env.BOT_USERNAME}\\b`, "gi"), " ");
  const ops = parseMessage(cleaned);

  // Manual settle-ups need recipient approval, not immediate recording.
  const settleOps = ops.filter((o): o is Extract<ParsedOp, { kind: "settle" }> => o.kind === "settle");
  if (settleOps.length) {
    await handleSettleOps(ctx, settleOps);
    return;
  }

  if (ops.length === 0) {
    await ctx.reply(
      "I couldn't read that. Try one of these formats:\n\n" + expenseExamples(env.BOT_USERNAME),
      { parse_mode: "Markdown" },
    );
    return;
  }

  let created, summary;
  try {
    created = await applyParsedOps(ctx.dbGroupId, ops);
    summary = await getGroupSummary(ctx.dbGroupId);
  } catch (err) {
    if (err instanceof AppError) {
      await ctx.reply(`⚠️ ${err.message}`);
      return;
    }
    throw err;
  }

  const cur = summary.currency;

  // Per-expense breakdown, incl. each participant's computed share, so users can
  // verify the maths behind the balances the image shows.
  const recorded = created
    .map((e) => {
      if (e.kind === "debt") {
        const debtor = e.shares[0];
        const who = debtor ? name(debtor.user) : "?";
        return `• ${who} owes ${name(e.payer)} *${formatCents(e.amountCents, e.currency)} ${e.currency}*`;
      }
      const what = e.description ? ` (${e.description})` : "";
      const shares = e.shares
        .map((s) => `    ↳ ${name(s.user)} owes ${formatCents(s.amountCents, e.currency)} ${e.currency}`)
        .join("\n");
      return `• ${name(e.payer)} paid *${formatCents(e.amountCents, e.currency)} ${e.currency}*${what}\n${shares}`;
    })
    .join("\n");

  const balanceLines = summary.balances
    .filter((b) => b.netCents !== 0)
    .sort((a, b) => b.netCents - a.netCents)
    .map((b) =>
      b.netCents > 0
        ? `• ${name(b.user)} is owed *${formatCents(b.netCents, cur)} ${cur}*`
        : `• ${name(b.user)} owes *${formatCents(b.netCents, cur)} ${cur}*`,
    )
    .join("\n");

  const owed =
    summary.suggestions.length === 0
      ? "🎉 All settled up!"
      : summary.suggestions
          .map((s) => `• ${name(s.from)} → ${name(s.to)}: *${formatCents(s.amountCents, cur)} ${cur}*`)
          .join("\n");

  const report =
    `✅ *Recorded*\n${recorded}\n\n` +
    (balanceLines ? `📊 *Net balances*\n${balanceLines}\n\n` : "") +
    `🧮 *Who pays whom*\n${owed}`;

  const kb = miniAppKeyboard(ctx.dbGroupId);
  try {
    const png = renderSummaryImage(summary);
    const photo = new InputFile(png, "summary.png");
    // Caption limit is 1024; if the report is longer, send it as its own message.
    if (report.length <= 1024) {
      await ctx.replyWithPhoto(photo, { caption: report, parse_mode: "Markdown", reply_markup: kb });
    } else {
      await ctx.replyWithPhoto(photo);
      await ctx.reply(report.slice(0, 4096), { parse_mode: "Markdown", reply_markup: kb });
    }
  } catch {
    // Image render failed — the text report already carries the full breakdown.
    await ctx.reply(report.slice(0, 4096), { parse_mode: "Markdown", reply_markup: kb });
  }
}
