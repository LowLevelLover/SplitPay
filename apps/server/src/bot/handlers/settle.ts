import type { SplitPayContext } from "../context.js";
import type { ParsedOp } from "../parser/expense.js";
import { AppError } from "../../lib/errors.js";
import { fmtMoney } from "../format.js";
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
        `• از ${nm(dto.to)} خواستم دریافت *${fmtMoney(dto.amountCents, dto.currency)}* از طرف ${nm(dto.from)} را تأیید کند`,
      );
    } catch (err) {
      lines.push(`⚠️ ثبت نشد${err instanceof AppError ? `: ${err.message}` : "."}`);
    }
  }

  await ctx.reply(`💸 *درخواست تسویه ثبت شد*\n${lines.join("\n")}`, { parse_mode: "Markdown" });
}
