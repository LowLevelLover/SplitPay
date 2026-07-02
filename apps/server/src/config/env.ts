import { config } from "dotenv";
import { z } from "zod";

// Load repo-root .env (cwd is apps/server when run via pnpm --filter).
config({ path: "../../.env" });

// Loads & validates env once at startup; crashes loudly on a missing var.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required (get one from @BotFather)"),
  // The bot's @username without the leading @ (e.g. PayDongBot). Used to detect
  // mentions and to build the example commands shown to users.
  BOT_USERNAME: z.string().min(1, "BOT_USERNAME is required (your bot's @username, no @)"),
  // How the bot receives updates. `polling` needs no public URL (best for local
  // dev); `webhook` requires a public PUBLIC_URL that Telegram can reach.
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  // Public base URL of this server. Required for webhook mode & the Mini App
  // button; optional under polling (defaults to localhost).
  PUBLIC_URL: z.string().url().optional(),
  // Optional outbound proxy (http/https) for the Telegram API — e.g. where
  // Telegram is blocked. Example: http://user:pass@127.0.0.1:8080
  PROXY_URL: z.string().url().optional(),
  // Dev-only auth bypass for the local admin panel. Defaults on outside prod.
  DEV_AUTH: z.enum(["true", "false"]).optional(),
  // TON escrow. Without TON_MNEMONIC the app uses the off-chain simulation.
  TON_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  TON_MNEMONIC: z.string().optional(), // 24 space-separated words (service wallet)
  TON_API_KEY: z.string().optional(), // toncenter API key (optional, higher rate limit)
  // Live fiat/crypto market prices (TON/IRT, USDT/IRT, …) for settlement conversion.
  PRICES_URL: z.string().url().default("https://swapwallet.app/api/v1/market/prices"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

if (env.BOT_MODE === "webhook" && !env.PUBLIC_URL) {
  console.error("❌ PUBLIC_URL is required when BOT_MODE=webhook");
  process.exit(1);
}

// Where the Mini App is served from; falls back to localhost under polling.
export const publicUrl = env.PUBLIC_URL ?? `http://localhost:${env.PORT}`;
// When true, the /admin panel and its dev-auth header bypass are enabled.
export const devAuth = env.DEV_AUTH ? env.DEV_AUTH === "true" : !isProd;
