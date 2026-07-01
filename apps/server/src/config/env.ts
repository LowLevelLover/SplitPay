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
  PUBLIC_URL: z.string().url(),
  // TON escrow. Without TON_MNEMONIC the app uses the off-chain simulation.
  TON_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  TON_MNEMONIC: z.string().optional(), // 24 space-separated words (service wallet)
  TON_API_KEY: z.string().optional(), // toncenter API key (optional, higher rate limit)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
