import { env, publicUrl } from "./config/env.js";
import { createBot } from "./bot/index.js";
import { buildApp } from "./app.js";

// Entry: start the HTTP server first (so the API + /admin panel work even if
// Telegram is unreachable), then connect the bot via polling or webhook.
async function main() {
  const bot = createBot();
  const app = await buildApp(bot);
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`🚀 SplitPay listening on :${env.PORT}`);

  try {
    await bot.init(); // loads bot.me (username) before handling updates
    if (env.BOT_MODE === "webhook") {
      const webhookUrl = `${publicUrl}/webhook`;
      await bot.api.setWebhook(webhookUrl);
      app.log.info(`🤖 @${bot.botInfo.username} webhook → ${webhookUrl}`);
    } else {
      // Long polling: no public URL needed. Clear any stale webhook first.
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      void bot.start({
        onStart: (me) => app.log.info(`🤖 @${me.username} polling for updates`),
      });
    }
  } catch (err) {
    // Don't take the whole app down if Telegram is unreachable — the Mini App
    // and /admin panel still work; set PROXY_URL if Telegram is blocked.
    app.log.error({ err }, "⚠️  Bot failed to connect to Telegram (API up anyway)");
  }
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
