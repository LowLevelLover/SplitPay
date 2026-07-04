import { Bot } from "grammy";
import type { SplitPayContext } from "../context.js";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { getGroupSummary } from "../../services/balances.js";
import { createSettlement } from "../../services/settlements.js";
import { getUserByTelegramId, saveTonAddress } from "../../services/users.js";
import { miniAppKeyboard, webAppHint } from "../keyboard.js";
import { expenseExamples } from "../examples.js";
import { fmtMoney } from "../format.js";

const name = (u: { username: string | null; firstName: string }) =>
  u.username ? `@${u.username}` : u.firstName;

const openApp = miniAppKeyboard;

/** Registers all slash commands on the bot. */
export function registerCommands(bot: Bot<SplitPayContext>): void {
  // Persian command menu (the ≡ button in Telegram clients); best-effort.
  bot.api
    .setMyCommands([
      { command: "help", description: "راهنما و نمونه دستورها" },
      { command: "balance", description: "مانده‌ها و اینکه چه کسی به چه کسی بپردازد" },
      { command: "settle", description: "شروع تسویه گروهی روی TON (تست‌نت)" },
      { command: "wallet", description: "ثبت یا نمایش آدرس کیف پول TON" },
    ])
    .catch(() => {});

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 *اسپلیت‌پی* — من حساب می‌کنم چه کسی به چه کسی بدهکار است و بعد روی TON تسویه می‌کنیم.\n\n" +
        "برای ثبت هزینه من را منشن کنید؛ مثلاً:\n" +
        `\`@${env.BOT_USERNAME} @ali paid 60000 dinner\`\n\n` +
        "یا یک دفترچه کامل:\n" +
        "`@ali -50000 kabab, +150000 paid`\n`@bob -100000 pizza`\n\n" +
        "بعد /balance برای دیدن مانده‌ها و /settle برای شروع تسویه.",
      { parse_mode: "Markdown" },
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "*راهنمای اسپلیت‌پی*\n\n" +
        "ثبت هزینه (با منشن کردن من)، به هر یک از این شکل‌ها:\n" +
        expenseExamples(env.BOT_USERNAME) +
        "\n\n" +
        "• /balance — مانده‌ها و اینکه چه کسی به چه کسی بپردازد\n" +
        "• /settle — شروع تسویه گروهی روی TON (تست‌نت)\n" +
        "• /wallet — ثبت آدرس کیف پول TON برای دریافت تسویه\n\n" +
        webAppHint(),
      { parse_mode: "Markdown" },
    );
  });

  bot.command("balance", async (ctx) => {
    if (!ctx.dbGroupId) {
      await ctx.reply("اول من را به یک گروه اضافه کنید و یک هزینه ثبت کنید!");
      return;
    }

    const summary = await getGroupSummary(ctx.dbGroupId);
    if (summary.suggestions.length === 0) {
      await ctx.reply("🎉 همه‌چیز تسویه است — کسی به کسی بدهکار نیست!");
      return;
    }

    const lines = summary.suggestions.map(
      (s) => `• ${name(s.from)} باید به ${name(s.to)} بپردازد: *${fmtMoney(s.amountCents, summary.currency)}*`,
    );

    await ctx.reply(
      `*چه کسی به چه کسی بپردازد:*\n${lines.join("\n")}\n\n${webAppHint(ctx.dbGroupId)}`,
      { parse_mode: "Markdown", reply_markup: openApp(ctx.dbGroupId) },
    );
  });

  bot.command("settle", async (ctx) => {
    if (!ctx.dbGroupId) {
      await ctx.reply("اول من را به یک گروه اضافه کنید و چند هزینه ثبت کنید!");
      return;
    }
    try {
      const settlement = await createSettlement(ctx.dbGroupId, "TON");
      const involved = settlement.involved.map(name).join("، ");
      const lines = settlement.transfers.map(
        (t) => `• ${name(t.from)} باید به ${name(t.to)} بپردازد: *${fmtMoney(t.amountCents, settlement.asset)}*`,
      );
      await ctx.reply(
        `🤝 *پیشنهاد تسویه* (${settlement.asset})\n\n${lines.join("\n")}\n\n` +
          `همه افراد درگیر (${involved}) باید وب‌اپ را باز کنند و دکمه «تأیید» (Done) را بزنند. ` +
          "دریافت‌کننده‌ها حتماً اول آدرس کیف پول TON خود را با /wallet ثبت کنند (تست‌نت). " +
          "وقتی همه تأیید کردند، قرارداد امانی مستقر می‌شود و بدهکارها می‌توانند پرداخت کنند.\n\n" +
          webAppHint(ctx.dbGroupId),
        { parse_mode: "Markdown", reply_markup: openApp(ctx.dbGroupId) },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      await ctx.reply(`⚠️ تسویه شروع نشد${msg ? `: ${msg}` : "."}`);
    }
  });

  bot.command("wallet", async (ctx) => {
    if (!ctx.dbUserId || !ctx.from) return;
    const address = typeof ctx.match === "string" ? ctx.match.trim() : "";

    if (!address) {
      const user = await getUserByTelegramId(String(ctx.from.id));
      if (user?.tonAddress) {
        await ctx.reply(
          `👛 آدرس کیف پول TON شما:\n\`${user.tonAddress}\`\n\n` +
            "مبلغ تسویه‌ها (روی تست‌نت TON) به همین آدرس واریز می‌شود.\n" +
            "برای تغییر: `/wallet <آدرس جدید>`",
          { parse_mode: "Markdown" },
        );
      } else {
        await ctx.reply(
          "👛 هنوز آدرس کیف پولی ثبت نکرده‌اید.\n\n" +
            "آدرس TON خود را ثبت کنید تا مبلغ تسویه‌ها (روی تست‌نت TON) به آن واریز شود:\n" +
            "`/wallet <آدرس>`",
          { parse_mode: "Markdown" },
        );
      }
      return;
    }

    try {
      await saveTonAddress(ctx.dbUserId, address);
    } catch (err) {
      if (err instanceof AppError) {
        await ctx.reply(`⚠️ این آدرس ذخیره نشد: ${err.message}`);
        return;
      }
      throw err;
    }

    // Service returns void; re-read for the normalized form.
    const saved = await getUserByTelegramId(String(ctx.from.id));
    await ctx.reply(
      `✅ آدرس کیف پول TON شما ثبت شد:\n\`${saved?.tonAddress ?? address}\`\n\n` +
        "مبلغ تسویه‌ها (روی تست‌نت TON) به همین آدرس واریز می‌شود.",
      { parse_mode: "Markdown" },
    );
  });
}
