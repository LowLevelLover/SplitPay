import { env } from "./config/env.js";
import { createBot } from "./bot/index.js";
import { buildApp } from "./app.js";

// Entry: create bot, build server, register the Telegram webhook, listen.
async function main() {
  const bot = createBot();
  await bot.init(); // loads bot.me (username) before handling updates

  const app = await buildApp(bot);
  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  // Point Telegram at our webhook. Safe to call on every boot.
  const webhookUrl = `${env.PUBLIC_URL}/webhook`;
  await bot.api.setWebhook(webhookUrl);
  app.log.info(`🤖 @${bot.botInfo.username} webhook → ${webhookUrl}`);
  app.log.info(`🚀 SplitPay listening on :${env.PORT}`);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
