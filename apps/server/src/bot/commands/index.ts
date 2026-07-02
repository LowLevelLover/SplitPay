import { Bot } from "grammy";
import type { SplitPayContext } from "../context.js";
import { env } from "../../config/env.js";
import { formatCents } from "../../lib/money.js";
import { getGroupSummary } from "../../services/balances.js";
import { createSettlement } from "../../services/settlements.js";
import { miniAppKeyboard } from "../keyboard.js";

const name = (u: { username: string | null; firstName: string }) =>
  u.username ? `@${u.username}` : u.firstName;

const openApp = miniAppKeyboard;

/** Registers all slash commands on the bot. */
export function registerCommands(bot: Bot<SplitPayContext>): void {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 *SplitPay* — I track who owes whom, then settle up on TON.\n\n" +
        "Mention me with expenses, e.g.\n" +
        `\`@${env.BOT_USERNAME} @ali paid 60000 dinner\`\n\n` +
        "or a full ledger:\n" +
        "`@ali -50000 kabab, +150000 paid`\n`@bob -100000 pizza`\n\n" +
        "Then /balance to see the graph, /settle to pay on-chain.",
      { parse_mode: "Markdown" },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "*How to use SplitPay*\n\n" +
        "Record (mention me), any of:\n" +
        `• \`@${env.BOT_USERNAME} @ali paid 60000 dinner @bob\` — equal split\n` +
        `• \`@${env.BOT_USERNAME} @ali should pay @bob 50000\` — direct debt\n` +
        `• ledger lines \`@ali -50000 kabab, +150000 paid\`\n\n` +
        "• /balance — balances & who pays whom\n" +
        "• /settle — start an on-chain settlement (TON escrow)\n" +
        "• Open the Mini App for the full breakdown & payments.",
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
      (s) => `• ${name(s.from)} → ${name(s.to)}: *${formatCents(s.amountCents, summary.currency)} ${summary.currency}*`,
    );

    await ctx.reply(`*Who pays whom:*\n${lines.join("\n")}`, {
      parse_mode: "Markdown",
      reply_markup: openApp(ctx.dbGroupId),
    });
  });

  bot.command("settle", async (ctx) => {
    if (!ctx.dbGroupId) {
      await ctx.reply("Add me to a group and record expenses first!");
      return;
    }
    try {
      const settlement = await createSettlement(ctx.dbGroupId, "TON");
      const involved = settlement.involved.map(name).join(", ");
      const lines = settlement.transfers.map(
        (t) => `• ${name(t.from)} → ${name(t.to)}: *${formatCents(t.amountCents, settlement.asset)} ${settlement.asset}*`,
      );
      await ctx.reply(
        `🤝 *Settlement proposed* (${settlement.asset}).\n\n${lines.join("\n")}\n\n` +
          `Everyone involved (${involved}) must open the app, connect a TON wallet, and tap *Done*. ` +
          "Once all agree, the escrow deploys and debtors can pay.",
        { parse_mode: "Markdown", reply_markup: openApp(ctx.dbGroupId) },
      );
    } catch (err) {
      await ctx.reply(err instanceof Error ? err.message : "Couldn't start a settlement.");
    }
  });
}
