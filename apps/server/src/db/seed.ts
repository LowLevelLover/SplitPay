import { eq } from "drizzle-orm";
import { db, schema } from "./client.js";
import { splitEvenly } from "../lib/money.js";

// Demo group + expenses so /balance and the Mini App have data. Run: pnpm db:seed
async function main() {
  const [alice, bob, carol] = await Promise.all(
    [
      { telegramId: "1001", username: "alice", firstName: "Alice" },
      { telegramId: "1002", username: "bob", firstName: "Bob" },
      { telegramId: "1003", username: "carol", firstName: "Carol" },
    ].map(async (u) => {
      const [row] = await db
        .insert(schema.users)
        .values(u)
        .onConflictDoUpdate({ target: schema.users.telegramId, set: u })
        .returning();
      return row!;
    }),
  );

  const [group] = await db
    .insert(schema.groups)
    .values({ telegramChatId: "-100999", title: "Demo Trip 🏖️", currency: "USD" })
    .onConflictDoUpdate({ target: schema.groups.telegramChatId, set: { title: "Demo Trip 🏖️" } })
    .returning();

  for (const userId of [alice!.id, bob!.id, carol!.id]) {
    await db
      .insert(schema.groupMembers)
      .values({ groupId: group!.id, userId })
      .onConflictDoNothing();
  }

  // Idempotent re-seed.
  await db.delete(schema.expenses).where(eq(schema.expenses.groupId, group!.id));

  // Alice paid 60 for dinner (3-way); Bob paid 30 for taxi (Bob + Carol).
  const dinner = splitEvenly(6000, 3);
  const [dinnerExp] = await db
    .insert(schema.expenses)
    .values({ groupId: group!.id, payerId: alice!.id, amountCents: 6000, description: "Dinner" })
    .returning();
  await db.insert(schema.expenseShares).values([
    { expenseId: dinnerExp!.id, userId: alice!.id, amountCents: dinner[0]! },
    { expenseId: dinnerExp!.id, userId: bob!.id, amountCents: dinner[1]! },
    { expenseId: dinnerExp!.id, userId: carol!.id, amountCents: dinner[2]! },
  ]);

  const taxi = splitEvenly(3000, 2);
  const [taxiExp] = await db
    .insert(schema.expenses)
    .values({ groupId: group!.id, payerId: bob!.id, amountCents: 3000, description: "Taxi" })
    .returning();
  await db.insert(schema.expenseShares).values([
    { expenseId: taxiExp!.id, userId: bob!.id, amountCents: taxi[0]! },
    { expenseId: taxiExp!.id, userId: carol!.id, amountCents: taxi[1]! },
  ]);

  console.log(`✅ Seeded "${group!.title}" (id ${group!.id}) — 3 members, 2 expenses.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
