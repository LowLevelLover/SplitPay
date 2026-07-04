import type { SplitPayContext } from "../context.js";
import { AppError } from "../../lib/errors.js";
import { fmtMoney } from "../format.js";
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
    await ctx.answerCallbackQuery({ text: "این درخواست تسویه دیگر وجود ندارد.", show_alert: true });
    return;
  }

  if (dto.to.id !== ctx.dbUserId) {
    await ctx.answerCallbackQuery({ text: `فقط ${nm(dto.to)} می‌تواند به این درخواست پاسخ دهد.`, show_alert: true });
    return;
  }
  if (dto.status !== "pending") {
    await ctx.answerCallbackQuery({
      text: dto.status === "confirmed" ? "قبلاً تأیید شده است." : "قبلاً رد شده است.",
    });
    return;
  }

  try {
    dto =
      action === "confirm"
        ? await confirmManualSettlement(id, ctx.dbUserId)
        : await rejectManualSettlement(id, ctx.dbUserId);
  } catch (err) {
    const msg = err instanceof AppError ? `انجام نشد: ${err.message}` : "مشکلی پیش آمد.";
    await ctx.answerCallbackQuery({ text: msg, show_alert: true });
    return;
  }

  const amount = fmtMoney(dto.amountCents, dto.currency);
  const outcome =
    dto.status === "confirmed"
      ? `✅ تأیید شد — ${nm(dto.from)} مبلغ *${amount}* را به ${nm(dto.to)} پرداخت کرد. بدهی تسویه شد.`
      : `❌ رد شد — پرداخت ادعایی ${nm(dto.from)} به مبلغ *${amount}* تأیید نشد.`;

  await ctx.answerCallbackQuery({ text: dto.status === "confirmed" ? "تأیید شد" : "رد شد" });
  try {
    await ctx.editMessageText(outcome, { parse_mode: "Markdown" });
  } catch {
    await ctx.reply(outcome, { parse_mode: "Markdown" });
  }
}
