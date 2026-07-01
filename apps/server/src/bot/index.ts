import { Bot } from "grammy";
import type { SplitPayContext } from "./context.js";
import { env } from "../config/env.js";
import { register } from "./middleware/register.js";
import { registerCommands } from "./commands/index.js";
import { handleExpenseMention } from "./handlers/expense.js";

// Build the grammY bot. Webhook is wired in app.ts (shared Fastify server).
export function createBot(): Bot<SplitPayContext> {
  const bot = new Bot<SplitPayContext>(env.BOT_TOKEN);

  // Record user/group on every update, before any handler.
  bot.use(register);

  registerCommands(bot);

  // Any group text message that @-mentions the bot is treated as an expense.
  bot.on("message:text", async (ctx, next) => {
    const username = ctx.me.username;
    const mentionsBot = ctx.message.text.toLowerCase().includes(`@${username.toLowerCase()}`);
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
