import type { FastifyRequest } from "fastify";
import { devAuth } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import { getUserByTelegramId, upsertUser } from "../../services/users.js";
import { validateInitData } from "./initData.js";

// Authenticate a request from its X-Init-Data header; returns the internal user.
export async function authenticate(request: FastifyRequest): Promise<{ userId: string }> {
  // Dev-only bypass for the local admin panel: impersonate a member by Telegram
  // id via X-Dev-User (no HMAC). Never enabled in production (see config/env).
  if (devAuth) {
    const devUser = request.headers["x-dev-user"];
    if (typeof devUser === "string" && devUser) {
      const user = await getUserByTelegramId(devUser);
      if (!user) throw new AppError(`No user with telegramId ${devUser}`, 401);
      return { userId: user.id };
    }
  }

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
