import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

const here = dirname(fileURLToPath(import.meta.url));
// apps/server/src/web -> apps/web/dist
const webDist = resolve(here, "../../../web/dist");

// Serve the built Mini App (apps/web/dist). Dev uses the Vite server instead.
export async function registerStatic(app: FastifyInstance): Promise<void> {
  await app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
  });

  // SPA fallback: any non-API, non-webhook GET returns index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.method === "GET" && !req.url.startsWith("/api") && !req.url.startsWith("/webhook")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not found" });
  });
}
