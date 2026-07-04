import { createHash } from "node:crypto";
import type { SettlementAsset } from "@split-pay/shared";
import { Address, internal, SendMode, toNano, type Cell } from "@ton/core";
import { TonClient, WalletContractV4 } from "@ton/ton";
import { keyPairFromSeed, mnemonicToPrivateKey, type KeyPair } from "@ton/crypto";
import {
  centsToBaseUnits,
  type DepositInstruction,
  type EscrowPlan,
  type EscrowProvider,
  type WatchHooks,
} from "./port.js";

// Real testnet escrow. Each settlement gets a deterministic wallet (derived
// from the service mnemonic + settlement id) that acts as the escrow account:
// debtors deposit TON into it; once fully funded the service releases to each
// creditor. Native TON only — USDT jettons are a stretch (see deposit()).
//
// NOTE: written against @ton libs but not exercised against live testnet in
// this repo; enable by setting TON_MNEMONIC (see config/env.ts).

const POLL_MS = 15_000;
const GAS_RESERVE = toNano("0.1");

// Plain-text comment (op 0) from a message body; null if absent/binary.
function readComment(body: Cell): string | null {
  try {
    const s = body.beginParse();
    if (s.remainingBits < 32 || s.loadUint(32) !== 0) return null;
    const text = s.loadStringTail().trim();
    return text || null;
  } catch {
    return null;
  }
}

export function createRealEscrowProvider(opts: {
  mnemonic: string[];
  endpoint: string;
  apiKey?: string;
}): EscrowProvider {
  const client = new TonClient({ endpoint: opts.endpoint, apiKey: opts.apiKey });

  let servicePromise: Promise<{ key: KeyPair; wallet: WalletContractV4 }> | null = null;
  const service = () => {
    servicePromise ??= (async () => {
      const key = await mnemonicToPrivateKey(opts.mnemonic);
      const wallet = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
      return { key, wallet };
    })();
    return servicePromise;
  };

  // Per-settlement escrow keypair — deterministic, so no secret storage needed.
  const escrowKey = async (settlementId: string): Promise<KeyPair> => {
    const { key } = await service();
    const seed = createHash("sha256").update(Buffer.concat([key.secretKey, Buffer.from(settlementId)])).digest();
    return keyPairFromSeed(seed);
  };

  const escrowWallet = async (settlementId: string) => {
    const key = await escrowKey(settlementId);
    return { key, wallet: WalletContractV4.create({ workchain: 0, publicKey: key.publicKey }) };
  };

  async function deploy(plan: EscrowPlan): Promise<{ address: string }> {
    if (plan.asset !== "TON") throw new Error("Real escrow supports native TON only for now");
    const { wallet } = await escrowWallet(plan.settlementId);
    const address = wallet.address.toString({ testOnly: true, bounceable: false });
    // Fund a little gas so the escrow can pay out later.
    const { key, wallet: sw } = await service();
    if (!(await client.isContractDeployed(sw.address))) {
      const swAddr = sw.address.toString({ testOnly: true, bounceable: false });
      throw new Error(
        `TON service wallet ${swAddr} is not deployed/funded — send it some testnet TON ` +
          `(@testgiver_ton_bot or https://faucet.tonxapi.com) before settling on-chain`,
      );
    }
    const opened = client.open(sw);
    const seqno = await opened.getSeqno();
    await opened.sendTransfer({
      secretKey: key.secretKey,
      seqno,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [internal({ to: wallet.address, value: GAS_RESERVE, bounce: false })],
    });
    return { address };
  }

  function depositFor(
    address: string,
    transferId: string,
    amountCents: number,
    asset: SettlementAsset,
  ): DepositInstruction {
    return { address, amountNano: centsToBaseUnits(amountCents, asset), comment: transferId, asset };
  }

  function watch(_address: string, plan: EscrowPlan, hooks: WatchHooks): void {
    const paid = new Set<string>();
    const transferIds = new Set(plan.transfers.map((t) => t.transferId));

    const timer = setInterval(async () => {
      try {
        const { wallet } = await escrowWallet(plan.settlementId);

        // Precise attribution: incoming deposits carrying a transfer-id comment.
        if (await client.isContractDeployed(wallet.address)) {
          const txs = await client.getTransactions(wallet.address, { limit: 20 });
          for (const tx of txs) {
            const msg = tx.inMessage;
            if (!msg || msg.info.type !== "internal") continue;
            const comment = readComment(msg.body);
            if (comment && transferIds.has(comment) && !paid.has(comment)) {
              paid.add(comment);
              hooks.onTransferPaid(comment, tx.hash().toString("hex"));
            }
          }
        }

        // Fallback for comment-less deposits: coarse cumulative-balance heuristic.
        const state = await client.getBalance(wallet.address);
        const funded = state > GAS_RESERVE ? state - GAS_RESERVE : 0n;
        let covered = 0;
        for (const t of plan.transfers) {
          covered += t.amountCents;
          const need = BigInt(centsToBaseUnits(covered, plan.asset));
          if (!paid.has(t.transferId) && funded >= need) {
            paid.add(t.transferId);
            hooks.onTransferPaid(t.transferId, null);
          }
        }

        if (paid.size === plan.transfers.length) {
          clearInterval(timer);
          await release(plan);
          hooks.onReleased();
        }
      } catch (err) {
        console.error("TON watch error:", err);
      }
    }, POLL_MS);
  }

  async function release(plan: EscrowPlan): Promise<void> {
    const { key, wallet } = await escrowWallet(plan.settlementId);
    const opened = client.open(wallet);
    // First-ever outgoing transfer: uninit wallet has seqno 0 and deploys itself
    // with this message (the opened contract carries init). getSeqno can throw
    // on uninit accounts on some endpoints — guard it.
    let seqno = 0;
    if (await client.isContractDeployed(wallet.address)) {
      try {
        seqno = await opened.getSeqno();
      } catch {
        seqno = 0;
      }
    }
    const messages = plan.transfers
      .filter((t) => t.toAddress)
      .map((t) =>
        internal({
          to: Address.parse(t.toAddress!),
          value: BigInt(centsToBaseUnits(t.amountCents, plan.asset)),
          bounce: false,
        }),
      );
    if (messages.length === 0) return;
    await opened.sendTransfer({
      secretKey: key.secretKey,
      seqno,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages,
    });
  }

  async function status(
    address: string,
    _plan: EscrowPlan,
  ): Promise<{ deployed: boolean; balanceNano: string }> {
    const addr = Address.parse(address);
    const deployed = await client.isContractDeployed(addr);
    const balance = deployed ? await client.getBalance(addr) : 0n;
    return { deployed, balanceNano: balance.toString() };
  }

  return { kind: "ton", deploy, depositFor, watch, status };
}
