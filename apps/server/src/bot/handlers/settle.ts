import type { SplitPayContext } from "../context.js";
import type { ParsedOp } from "../parser/expense.js";
import { AppError } from "../../lib/errors.js";
import { formatCents } from "../../lib/money.js";
import { createManualSettlement } from "../../services/manualSettlements.js";
import { getOrCreateUserByUsername } from "../../services/users.js";
import { sendManualSettlementRequest } from "../notify.js";

const nm = (u: { username: string | null; firstName: string }) =>
  u.username ? `@${u.username}` : u.firstName;

type SettleOp = Extract<ParsedOp, { kind: "settle" }>;

/** Record pending settle-ups from a bot message and ask each recipient to confirm. */
export async function handleSettleOps(ctx: SplitPayContext, ops: SettleOp[]): Promise<void> {
  if (!ctx.dbGroupId || !ctx.chat) return;
  const chatId = String(ctx.chat.id);
  const lines: string[] = [];

  for (const op of ops) {
    try {
      const fromUserId = op.fromUsername
        ? (await getOrCreateUserByUsername(op.fromUsername)).id
        : ctx.dbUserId;
      if (!fromUserId) continue;
      const toUser = await getOrCreateUserByUsername(op.toUsername);
      const dto = await createManualSettlement({
        groupId: ctx.dbGroupId,
        fromUserId,
        toUserId: toUser.id,
        amountCents: op.amountCents,
        note: op.description,
      });
      await sendManualSettlementRequest(ctx.api, dto, chatId);
      lines.push(
        `• Asked ${nm(dto.to)} to confirm *${formatCents(dto.amountCents, dto.currency)} ${dto.currency}* from ${nm(dto.from)}`,
      );
    } catch (err) {
      lines.push(`⚠️ ${err instanceof AppError ? err.message : "couldn't record that settle-up"}`);
    }
  }

  await ctx.reply(`💸 *Settle-up requested*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
}
