import { Bot, InlineKeyboard } from "grammy";
import type { SplitPayContext } from "../context.js";
import { env } from "../../config/env.js";
import { formatCents } from "../../lib/money.js";
import { getGroupSummary } from "../../services/balances.js";

/** Registers all slash commands on the bot. */
export function registerCommands(bot: Bot<SplitPayContext>): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 *SplitPay* — I track who owes whom in this group.\n\n" +
        `Mention me with an expense, e.g.\n\`@${ctx.me.username} paid 40 dinner @ana @bob\`\n\n` +
        "Then use /balance to see the summary.",
      { parse_mode: "Markdown" },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "*How to use SplitPay*\n\n" +
        `• Record: \`@${ctx.me.username} 40 taxi @ana\`\n` +
        "• /balance — show balances & who pays whom\n" +
        "• Open the Mini App for the full breakdown.",
      { parse_mode: "Markdown" },
    );
  });

  bot.command("balance", async (ctx) => {
    if (!ctx.dbGroupId) {
      await ctx.reply("Add me to a group and record an expense first!");
      return;
    }

    const summary = await getGroupSummary(ctx.dbGroupId);
    if (summary.suggestions.length === 0) {
      await ctx.reply("🎉 All settled up — nobody owes anything!");
      return;
    }

    const lines = summary.suggestions.map(
      (s) =>
        `• ${s.from.username ?? s.from.firstName} → ${s.to.username ?? s.to.firstName}: ` +
        `*${formatCents(s.amountCents)} ${summary.currency}*`,
    );

    const keyboard = new InlineKeyboard().webApp(
      "💰 Open SplitPay",
      `${env.PUBLIC_URL}/?groupId=${ctx.dbGroupId}`,
    );

    await ctx.reply(`*Who pays whom:*\n${lines.join("\n")}`, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  });
}
