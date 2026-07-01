import type { NextFunction } from "grammy";
import type { SplitPayContext } from "../context.js";
import { upsertUser } from "../../services/users.js";
import { ensureMembership, upsertGroup } from "../../services/groups.js";

// Every update: upsert sender (User) and, in groups, the Group + membership;
// stash internal ids on ctx.
export async function register(ctx: SplitPayContext, next: NextFunction): Promise<void> {
  if (!ctx.from || ctx.from.is_bot) return next();

  const user = await upsertUser({
    telegramId: String(ctx.from.id),
    username: ctx.from.username ?? null,
    firstName: ctx.from.first_name,
  });
  ctx.dbUserId = user.id;

  if (ctx.chat && ctx.chat.type !== "private") {
    const group = await upsertGroup({
      telegramChatId: String(ctx.chat.id),
      title: "title" in ctx.chat ? ctx.chat.title : null,
    });
    await ensureMembership(group.id, user.id);
    ctx.dbGroupId = group.id;
  }

  return next();
}
