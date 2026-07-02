import { InlineKeyboard } from "grammy";
import { publicUrl } from "../config/env.js";

// "Open SplitPay" button linking to the web app. Telegram rejects url buttons
// pointing at localhost/loopback (BUTTON_TYPE_INVALID), so under local http
// polling there's no reachable URL — return undefined (no button).
export function miniAppKeyboard(groupId: string): InlineKeyboard | undefined {
  if (!publicUrl.startsWith("https://")) return undefined;
  return new InlineKeyboard().url("💰 Open SplitPay", `${publicUrl}/?groupId=${groupId}`);
}
