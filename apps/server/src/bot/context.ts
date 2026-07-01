import type { Context } from "grammy";

/**
 * Custom bot context. The `register` middleware populates these with the
 * internal DB ids so handlers never re-derive them.
 */
export interface SplitPayContext extends Context {
  dbUserId?: string;
  /** Present only in group chats (not in private DMs with the bot). */
  dbGroupId?: string;
}
