import type { UserDTO } from "@split-pay/shared";
import { Address } from "@ton/core";
import { eq, sql } from "drizzle-orm";
import { env } from "../config/env.js";
import { db, schema } from "../db/client.js";
import type { User } from "../db/schema.js";
import { AppError } from "../lib/errors.js";

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    telegramId: user.telegramId,
    username: user.username,
    firstName: user.firstName,
    tonAddress: user.tonAddress ?? null,
  };
}

/** Placeholder telegramId for a user we only know by @username so far. */
const pendingTelegramId = (username: string) => `pending:${username.toLowerCase()}`;

/**
 * Create the user if new, otherwise refresh their profile fields. If they were
 * previously referenced only by @username (a pending row), relink that row so
 * their existing debts carry over.
 */
export async function upsertUser(input: {
  telegramId: string;
  username?: string | null;
  firstName: string;
}): Promise<User> {
  if (input.username) {
    const already = await db.query.users.findFirst({
      where: eq(schema.users.telegramId, input.telegramId),
    });
    if (!already) {
      const pending = await db.query.users.findFirst({
        where: eq(schema.users.telegramId, pendingTelegramId(input.username)),
      });
      if (pending) {
        const [relinked] = await db
          .update(schema.users)
          .set({ telegramId: input.telegramId, username: input.username, firstName: input.firstName })
          .where(eq(schema.users.id, pending.id))
          .returning();
        return relinked!;
      }
    }
  }

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

/**
 * Resolve an @username to a user, creating a pending placeholder if we've
 * never seen them. Used when a message references someone who hasn't messaged.
 */
export async function getOrCreateUserByUsername(username: string): Promise<User> {
  const uname = username.toLowerCase();
  const existing = await db.query.users.findFirst({
    where: eq(sql`lower(${schema.users.username})`, uname),
  });
  if (existing) return existing;

  const [created] = await db
    .insert(schema.users)
    .values({ telegramId: pendingTelegramId(uname), username, firstName: username })
    .onConflictDoUpdate({ target: schema.users.telegramId, set: { username } })
    .returning();
  return created!;
}

/** Validate (raw or friendly form) and store normalized non-bounceable address. */
export async function saveTonAddress(userId: string, tonAddress: string): Promise<void> {
  let parsed: Address;
  try {
    parsed = Address.parse(tonAddress.trim());
  } catch {
    throw new AppError("Invalid TON address — paste it in raw or friendly form", 400);
  }
  const normalized = parsed.toString({
    bounceable: false,
    testOnly: env.TON_NETWORK !== "mainnet",
  });
  await db.update(schema.users).set({ tonAddress: normalized }).where(eq(schema.users.id, userId));
}

export async function getUserById(userId: string): Promise<User> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
  if (!user) throw new AppError("User not found", 404);
  return user;
}

/** Look up an existing user by their Telegram id (used by the dev-auth bypass). */
export async function getUserByTelegramId(telegramId: string): Promise<User | null> {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.telegramId, telegramId),
  });
  return user ?? null;
}
