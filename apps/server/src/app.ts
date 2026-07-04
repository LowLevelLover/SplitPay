import Fastify from "fastify";
import { webhookCallback } from "grammy";
import type { Bot } from "grammy";
import { ZodError } from "zod";
import type { SplitPayContext } from "./bot/context.js";
import { env, isProd } from "./config/env.js";
import { AppError } from "./lib/errors.js";
import { registerApiRoutes } from "./api/routes/index.js";
import { registerAdminRoutes } from "./api/routes/admin.js";
import { registerStatic } from "./web/static.js";

// Single Fastify server: /webhook (bot) + /api/* (REST) + /* (Mini App static).
export async function buildApp(bot: Bot<SplitPayContext>) {
  const app = Fastify({
    logger: isProd ? true : { transport: { target: "pino-pretty" } },
  });

  // Consistent JSON errors for expected failures.
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Invalid request", details: error.flatten() });
    }
    app.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });

  app.get("/health", async () => ({ ok: true }));

  // Telegram webhook — only in webhook mode. Registering the callback marks the
  // bot as webhook-started, which would block bot.start() long polling.
  if (env.BOT_MODE === "webhook") {
    app.post("/webhook", webhookCallback(bot, "fastify"));
  }

  await registerApiRoutes(app, bot);
  await registerAdminRoutes(app); // dev-only /admin panel
  await registerStatic(app); // must be last (registers the catch-all)

  return app;
}
