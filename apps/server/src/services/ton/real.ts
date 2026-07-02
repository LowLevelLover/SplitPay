import { createHash } from "node:crypto";
import type { SettlementAsset } from "@split-pay/shared";
import { Address, internal, SendMode, toNano } from "@ton/core";
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
    const total = plan.transfers.reduce((a, t) => a + t.amountCents, 0);

    const timer = setInterval(async () => {
      try {
        const { wallet } = await escrowWallet(plan.settlementId);
        const state = await client.getBalance(wallet.address);
        const funded = state > GAS_RESERVE ? state - GAS_RESERVE : 0n;
        // Mark deposits paid as balance accrues (coarse: by cumulative funding).
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
        void total;
      } catch (err) {
        console.error("TON watch error:", err);
      }
    }, POLL_MS);
  }

  async function release(plan: EscrowPlan): Promise<void> {
    const { key, wallet } = await escrowWallet(plan.settlementId);
    const opened = client.open(wallet);
    const seqno = await opened.getSeqno();
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

  return { kind: "ton", deploy, depositFor, watch };
}
