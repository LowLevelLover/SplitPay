import type { FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { upsertUser } from "../../services/users.js";
import { validateInitData } from "./initData.js";

// Authenticate a request from its X-Init-Data header; returns the internal user.
export async function authenticate(request: FastifyRequest): Promise<{ userId: string }> {
  const initData = request.headers["x-init-data"];
  if (typeof initData !== "string" || !initData) {
    throw new AppError("Missing X-Init-Data header", 401);
  }

  const tgUser = validateInitData(initData);
  const user = await upsertUser({
    telegramId: String(tgUser.id),
    username: tgUser.username ?? null,
    firstName: tgUser.first_name,
  });

  return { userId: user.id };
}
