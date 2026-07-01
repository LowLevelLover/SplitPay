// Wrapper over window.Telegram.WebApp (from telegram-web-app.js in index.html).

interface TelegramUser {
  id: number;
  username?: string;
  first_name: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser };
  ready: () => void;
  expand: () => void;
  colorScheme: "light" | "dark";
  themeParams: Record<string, string>;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getWebApp(): TelegramWebApp | null {
  return window.Telegram?.WebApp ?? null;
}

/** Call once at startup: tells Telegram the app is ready and expands it. */
export function initTelegram(): void {
  const wa = getWebApp();
  wa?.ready();
  wa?.expand();
}

/** The signed initData string; sent to the API for authentication. */
export function getInitData(): string {
  return getWebApp()?.initData ?? "";
}

/** groupId is passed by the bot's Mini App button as ?groupId=… */
export function getGroupIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("groupId");
}

/** Current Telegram user (unsigned; used only to match against group members). */
export function getCurrentTelegramId(): string | null {
  const id = getWebApp()?.initDataUnsafe?.user?.id;
  return id ? String(id) : null;
}
