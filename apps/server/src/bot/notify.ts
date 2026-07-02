import type { Api } from "grammy";
import { InlineKeyboard } from "grammy";
import type { ManualSettlementDTO } from "@split-pay/shared";
import { formatCents } from "../lib/money.js";

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
  const amount = `${formatCents(dto.amountCents, dto.currency)} ${dto.currency}`;
  const note = dto.note ? ` (${dto.note})` : "";
  const kb = new InlineKeyboard()
    .text("✅ Confirm", `msettle:confirm:${dto.id}`)
    .text("❌ Reject", `msettle:reject:${dto.id}`);

  const dm =
    `💸 *Settle-up request*\n\n${nm(dto.from)} says they paid you *${amount}*${note}.\n\n` +
    "Confirm if you received it — I'll clear the debt between you.";
  const group =
    `💸 *Settle-up request*\n\n${nm(dto.from)} says they paid ${nm(dto.to)} *${amount}*${note}.\n` +
    `${nm(dto.to)}, please confirm below.`;

  const recipient = dto.to.telegramId;
  try {
    if (recipient.startsWith("pending:")) throw new Error("recipient has no chat yet");
    await api.sendMessage(Number(recipient), dm, { parse_mode: "Markdown", reply_markup: kb });
  } catch {
    await api.sendMessage(Number(groupChatId), group, { parse_mode: "Markdown", reply_markup: kb });
  }
}
