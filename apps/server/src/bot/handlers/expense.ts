import { InlineKeyboard } from "grammy";
import type { SplitPayContext } from "../context.js";
import { env } from "../../config/env.js";
import { formatCents } from "../../lib/money.js";
import { applyParsedOps } from "../../services/expenses.js";
import { getGroupSummary } from "../../services/balances.js";
import { parseMessage } from "../parser/expense.js";

const name = (u: { username: string | null; firstName: string }) =>
  u.username ? `@${u.username}` : u.firstName;

// On bot mention: parse the message into expense/debt/ledger operations, record
// them, then reply with the updated "who pays whom" summary.
export async function handleExpenseMention(ctx: SplitPayContext): Promise<void> {
  const text = ctx.message?.text;
  if (!text || !ctx.dbGroupId) return;

  // Strip the bot's own @mention so it isn't parsed as a participant.
  const cleaned = text.replace(new RegExp(`@${ctx.me.username}\\b`, "gi"), " ");
  const ops = parseMessage(cleaned);
  if (ops.length === 0) {
    await ctx.reply(
      "I couldn't read that. Try one of:\n" +
        `• \`@${ctx.me.username} @ali paid 60000 dinner\`\n` +
        `• \`@${ctx.me.username} @ali should pay @bob 50000\`\n` +
        "• a ledger:\n`@ali -50000 kabab, +150000 paid`\n`@bob -100000 pizza`",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const created = await applyParsedOps(ctx.dbGroupId, ops);
  const summary = await getGroupSummary(ctx.dbGroupId);

  const recorded = created
    .map((e) => {
      const what = e.description ? ` (${e.description})` : "";
      return `• ${name(e.payer)} paid *${formatCents(e.amountCents, e.currency)} ${e.currency}*${what}`;
    })
    .join("\n");

  const owed =
    summary.suggestions.length === 0
      ? "🎉 All settled up!"
      : summary.suggestions
          .map(
            (s) =>
              `• ${name(s.from)} → ${name(s.to)}: *${formatCents(s.amountCents, summary.currency)} ${summary.currency}*`,
          )
          .join("\n");

  const keyboard = new InlineKeyboard().webApp(
    "💰 Open SplitPay",
    `${env.PUBLIC_URL}/?groupId=${ctx.dbGroupId}`,
  );

  await ctx.reply(`✅ Recorded:\n${recorded}\n\n*Who pays whom:*\n${owed}`, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}
