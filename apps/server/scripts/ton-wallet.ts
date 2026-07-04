import { config } from "dotenv";

// Repo-root .env, same as config/env.ts (cwd is apps/server under pnpm --filter).
config({ path: "../../.env" });

import { fromNano } from "@ton/core";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV4 } from "@ton/ton";

// Operator helper for the TON service wallet: generate a mnemonic if none is
// configured, otherwise report the wallet's address / deployment / balance.

const FUND_HINT =
  "Fund it with testnet TON: message @testgiver_ton_bot on Telegram, or use https://faucet.tonxapi.com";

async function walletFor(words: string[]) {
  const key = await mnemonicToPrivateKey(words);
  return WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
}

async function main(): Promise<void> {
  const mnemonic = process.env.TON_MNEMONIC?.trim();

  if (!mnemonic) {
    const words = await mnemonicNew();
    const wallet = await walletFor(words);
    const address = wallet.address.toString({ testOnly: true, bounceable: false });

    console.log("No TON_MNEMONIC set — generated a fresh service wallet.\n");
    console.log("Mnemonic (24 words):");
    console.log(`  ${words.join(" ")}\n`);
    console.log("Testnet address (non-bounceable):");
    console.log(`  ${address}\n`);
    console.log("Next steps:");
    console.log(`  1. Add to .env:  TON_MNEMONIC="${words.join(" ")}"`);
    console.log(`  2. ${FUND_HINT}`);
    return;
  }

  const network = process.env.TON_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const wallet = await walletFor(mnemonic.split(/\s+/));
  const address = wallet.address.toString({
    testOnly: network !== "mainnet",
    bounceable: false,
  });
  const endpoint =
    network === "mainnet"
      ? "https://toncenter.com/api/v2/jsonRPC"
      : "https://testnet.toncenter.com/api/v2/jsonRPC";
  const client = new TonClient({ endpoint, apiKey: process.env.TON_API_KEY });

  const [deployed, balance] = await Promise.all([
    client.isContractDeployed(wallet.address),
    client.getBalance(wallet.address),
  ]);

  console.log(`Service wallet (${network}): ${address}`);
  console.log(`Deployed: ${deployed ? "yes" : "no (deploys itself on the first outgoing transfer)"}`);
  console.log(`Balance:  ${fromNano(balance)} TON`);
  if (balance === 0n) console.log(FUND_HINT);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
