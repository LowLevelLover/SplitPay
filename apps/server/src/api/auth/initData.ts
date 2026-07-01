import { createHmac } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";

export interface TelegramInitUser {
  id: number;
  username?: string;
  first_name: string;
}

// Validate Telegram Mini App initData per the official HMAC algorithm:
//   secret = HMAC_SHA256("WebAppData", bot_token); hash = HMAC_SHA256(secret, dataCheckString)
// Returns the authenticated user or throws AppError(401).
export function validateInitData(initData: string): TelegramInitUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new AppError("Missing initData hash", 401);

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(env.BOT_TOKEN).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) throw new AppError("Invalid initData signature", 401);

  const userRaw = params.get("user");
  if (!userRaw) throw new AppError("initData has no user", 401);

  return JSON.parse(userRaw) as TelegramInitUser;
}
