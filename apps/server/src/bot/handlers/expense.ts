import { InlineKeyboard } from "grammy";
import { eq } from "drizzle-orm";
import type { SplitPayContext } from "../context.js";
import { env } from "../../config/env.js";
import { db, schema } from "../../db/client.js";
import { formatCents } from "../../lib/money.js";
import { createExpense } from "../../services/expenses.js";
import { parseExpense } from "../parser/expense.js";

// On bot mention: parse the message into an expense, split evenly among the
// mentioned members (or the whole group if none are mentioned).
export async function handleExpenseMention(ctx: SplitPayContext): Promise<void> {
  const text = ctx.message?.text;
  if (!text || !ctx.dbGroupId || !ctx.dbUserId) return;

  const draft = parseExpense(text);
  if (!draft) {
    await ctx.reply("I couldn't find an amount. Try: `@" + ctx.me.username + " paid 40 dinner @ana @bob`", {
      parse_mode: "Markdown",
    });
    return;
  }

  // Resolve mentioned @usernames to group members; default to everyone.
  const members = await db.query.groupMembers.findMany({
    where: eq(schema.groupMembers.groupId, ctx.dbGroupId),
    with: { user: true },
  });

  const mentioned = draft.participantUsernames.map((u) => u.toLowerCase());
  const participants =
    mentioned.length > 0
      ? members.filter((m) => m.user.username && mentioned.includes(m.user.username.toLowerCase()))
      : members;

  // Ensure the payer is part of the split.
  const participantIds = new Set(participants.map((m) => m.userId));
  participantIds.add(ctx.dbUserId);

  const expense = await createExpense({
    groupId: ctx.dbGroupId,
    payerId: ctx.dbUserId,
    amountCents: draft.amountCents,
    currency: draft.currency,
    description: draft.description,
    participantIds: [...participantIds],
  });

  const keyboard = new InlineKeyboard().webApp(
    "💰 Open SplitPay",
    `${env.PUBLIC_URL}/?groupId=${expense.groupId}`,
  );

  const desc = expense.description ? ` for *${expense.description}*` : "";
  await ctx.reply(
    `✅ Recorded *${formatCents(expense.amountCents)} ${expense.currency}*${desc}, ` +
      `split ${expense.participants.length} way(s).`,
    { parse_mode: "Markdown", reply_markup: keyboard },
  );
}
