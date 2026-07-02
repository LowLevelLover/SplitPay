import { Bot, type BotConfig } from "grammy";
import { HttpsProxyAgent } from "https-proxy-agent";
import type { SplitPayContext } from "./context.js";
import { env } from "../config/env.js";
import { register } from "./middleware/register.js";
import { registerCommands } from "./commands/index.js";
import { handleExpenseMention } from "./handlers/expense.js";
import { handleManualSettlementCallback } from "./handlers/settleApproval.js";

// Build the grammY bot. Webhook is wired in app.ts (shared Fastify server).
export function createBot(): Bot<SplitPayContext> {
  // Route Telegram API calls through a proxy when configured (e.g. where
  // Telegram is blocked). grammY uses node-fetch, whose proxy knob is `agent`.
  const config: BotConfig<SplitPayContext> | undefined = env.PROXY_URL
    ? { client: { baseFetchConfig: { agent: new HttpsProxyAgent(env.PROXY_URL) } as never } }
    : undefined;

  const bot = new Bot<SplitPayContext>(env.BOT_TOKEN, config);

  // Record user/group on every update, before any handler.
  bot.use(register);

  registerCommands(bot);

  // Recipient's Confirm/Reject on a manual settle-up request.
  bot.callbackQuery(/^msettle:(confirm|reject):/, handleManualSettlementCallback);

  // Any group text message that @-mentions the bot is treated as an expense.
  bot.on("message:text", async (ctx, next) => {
    const mentionsBot = ctx.message.text.toLowerCase().includes(`@${env.BOT_USERNAME.toLowerCase()}`);
    if (ctx.dbGroupId && mentionsBot) {
      await handleExpenseMention(ctx);
      return;
    }
    return next();
  });

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  return bot;
}
