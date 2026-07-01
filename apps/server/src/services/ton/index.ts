import { env } from "../../config/env.js";
import { simEscrowProvider } from "./sim.js";
import { createRealEscrowProvider } from "./real.js";
import type { EscrowProvider } from "./port.js";

const endpoint =
  env.TON_NETWORK === "mainnet"
    ? "https://toncenter.com/api/v2/jsonRPC"
    : "https://testnet.toncenter.com/api/v2/jsonRPC";

// Real on-chain escrow when a service mnemonic is configured; otherwise the
// off-chain simulation so the app runs end-to-end locally without testnet.
export const escrowProvider: EscrowProvider = env.TON_MNEMONIC
  ? createRealEscrowProvider({
      mnemonic: env.TON_MNEMONIC.trim().split(/\s+/),
      endpoint,
      apiKey: env.TON_API_KEY,
    })
  : simEscrowProvider;

export * from "./port.js";
