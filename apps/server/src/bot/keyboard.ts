import { InlineKeyboard } from "grammy";
import { publicUrl } from "../config/env.js";

// Web-app button. Telegram rejects url buttons pointing at localhost/loopback
// (BUTTON_TYPE_INVALID), so under local http there's no button — the hint text
// below carries the URL instead.
export function miniAppKeyboard(groupId: string): InlineKeyboard | undefined {
  if (!publicUrl.startsWith("https://")) return undefined;
  return new InlineKeyboard().url("💰 باز کردن اسپلیت‌پی", `${publicUrl}/?groupId=${groupId}`);
}

/** Persian hint pointing at the locally-served web app. */
export function webAppHint(groupId?: string): string {
  const url = groupId ? `${publicUrl}/?groupId=${groupId}` : publicUrl;
  return `🌐 برای مشاهده جزئیات و تسویه، وب‌اپ محلی را باز کنید: ${url}`;
}
