import type { GroupDTO } from "@split-pay/shared";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { toUserDTO } from "./users.js";

/** Create the group if new; used when the bot first sees a chat. */
export async function upsertGroup(input: { telegramChatId: string; title?: string | null }) {
  const [group] = await db
    .insert(schema.groups)
    .values({ telegramChatId: input.telegramChatId, title: input.title ?? null })
    .onConflictDoUpdate({
      target: schema.groups.telegramChatId,
      set: { title: input.title ?? null },
    })
    .returning();
  return group!;
}

/** Ensure a user is recorded as a member of a group (idempotent). */
export async function ensureMembership(groupId: string, userId: string): Promise<void> {
  await db
    .insert(schema.groupMembers)
    .values({ groupId, userId })
    .onConflictDoNothing();
}

/** Throws 403 unless the user is a member of the group. */
export async function assertMembership(groupId: string, userId: string): Promise<void> {
  const membership = await db.query.groupMembers.findFirst({
    where: and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)),
  });
  if (!membership) throw new AppError("You are not a member of this group", 403);
}

export async function getGroupDTO(groupId: string): Promise<GroupDTO> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, groupId),
    with: { members: { with: { user: true } } },
  });
  if (!group) throw new AppError("Group not found", 404);

  return {
    id: group.id,
    title: group.title,
    members: group.members.map((m) => toUserDTO(m.user)),
  };
}
