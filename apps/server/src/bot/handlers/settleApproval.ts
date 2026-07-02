import type { SplitPayContext } from "../context.js";
import { AppError } from "../../lib/errors.js";
import { formatCents } from "../../lib/money.js";
import {
  confirmManualSettlement,
  getManualSettlement,
  rejectManualSettlement,
} from "../../services/manualSettlements.js";

const nm = (u: { username: string | null; firstName: string }) =>
  u.username ? `@${u.username}` : u.firstName;

// Recipient tapped Confirm/Reject on a settle-up request (callback data
// `msettle:<action>:<id>`). Only the recipient may respond.
export async function handleManualSettlementCallback(ctx: SplitPayContext): Promise<void> {
  const match = ctx.callbackQuery?.data?.match(/^msettle:(confirm|reject):(.+)$/);
  if (!match || !ctx.dbUserId) return;
  const action = match[1]!;
  const id = match[2]!;

  let dto;
  try {
    dto = await getManualSettlement(id);
  } catch {
    await ctx.answerCallbackQuery({ text: "This settle-up no longer exists.", show_alert: true });
    return;
  }

  if (dto.to.id !== ctx.dbUserId) {
    await ctx.answerCallbackQuery({ text: `Only ${nm(dto.to)} can respond to this.`, show_alert: true });
    return;
  }
  if (dto.status !== "pending") {
    await ctx.answerCallbackQuery({ text: `Already ${dto.status}.` });
    return;
  }

  try {
    dto =
      action === "confirm"
        ? await confirmManualSettlement(id, ctx.dbUserId)
        : await rejectManualSettlement(id, ctx.dbUserId);
  } catch (err) {
    const msg = err instanceof AppError ? err.message : "Something went wrong.";
    await ctx.answerCallbackQuery({ text: msg, show_alert: true });
    return;
  }

  const amount = `${formatCents(dto.amountCents, dto.currency)} ${dto.currency}`;
  const outcome =
    dto.status === "confirmed"
      ? `✅ Confirmed — ${nm(dto.from)} paid ${nm(dto.to)} *${amount}*. Debt cleared.`
      : `❌ Rejected — ${nm(dto.from)}'s claimed payment of *${amount}* wasn't confirmed.`;

  await ctx.answerCallbackQuery({ text: dto.status === "confirmed" ? "Confirmed" : "Rejected" });
  try {
    await ctx.editMessageText(outcome, { parse_mode: "Markdown" });
  } catch {
    await ctx.reply(outcome, { parse_mode: "Markdown" });
  }
}
