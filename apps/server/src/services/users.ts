import type { UserDTO } from "@split-pay/shared";
import { db, schema } from "../db/client.js";
import type { User } from "../db/schema.js";

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
  };
}

/** Create the user if new, otherwise refresh their profile fields. */
export async function upsertUser(input: {
  telegramId: string;
  username?: string | null;
  firstName: string;
}): Promise<User> {
  const [user] = await db
    .insert(schema.users)
    .values({
      telegramId: input.telegramId,
      username: input.username ?? null,
      firstName: input.firstName,
    })
    .onConflictDoUpdate({
      target: schema.users.telegramId,
      set: { username: input.username ?? null, firstName: input.firstName },
    })
    .returning();

  return user!;
}
