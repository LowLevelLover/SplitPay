import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import type { ManualSettlementDTO } from "@split-pay/shared";
import { fmtMoney } from "./format.js";

const nm = (u: { username: string | null; firstName: string }) =>
  u.username ? `@${u.username}` : u.firstName;

/**
 * Ask the recipient to confirm a manual settle-up. DM them first; if that fails
 * (they've never started the bot privately), post in the group chat instead.
 */
export async function sendManualSettlementRequest(
  api: Api,
  dto: ManualSettlementDTO,
  groupChatId: string,
): Promise<void> {
  const amount = fmtMoney(dto.amountCents, dto.currency);
  const note = dto.note ? ` (${dto.note})` : "";
  const kb = new InlineKeyboard()
    .text("✅ تأیید", `msettle:confirm:${dto.id}`)
    .text("❌ رد", `msettle:reject:${dto.id}`);

  const dm =
    `💸 *درخواست تسویه*\n\n${nm(dto.from)} می‌گوید *${amount}* به شما پرداخت کرده است${note}.\n\n` +
    "اگر دریافت کرده‌اید تأیید کنید — بدهی بین شما را صاف می‌کنم.";
  const group =
    `💸 *درخواست تسویه*\n\n${nm(dto.from)} می‌گوید *${amount}* به ${nm(dto.to)} پرداخت کرده است${note}.\n` +
    `${nm(dto.to)}، لطفاً در پایین تأیید یا رد کنید.`;

  const recipient = dto.to.telegramId;
  try {
    if (recipient.startsWith("pending:")) throw new Error("recipient has no chat yet");
    await api.sendMessage(Number(recipient), dm, { parse_mode: "Markdown", reply_markup: kb });
  } catch {
    await api.sendMessage(Number(groupChatId), group, { parse_mode: "Markdown", reply_markup: kb });
  }
}
