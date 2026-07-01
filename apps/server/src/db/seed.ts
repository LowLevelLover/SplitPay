import { eq } from "drizzle-orm";
import { db, schema } from "./client.js";
import { splitEvenly } from "../lib/money.js";

// Demo group + expenses so /balance and the Mini App have data. Run: pnpm db:seed
// Amounts are integer cents; currency IRT displays as whole Toman.
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
    .values({ telegramChatId: "-100999", title: "Demo Trip 🏖️", currency: "IRT" })
    .onConflictDoUpdate({ target: schema.groups.telegramChatId, set: { title: "Demo Trip 🏖️", currency: "IRT" } })
    .returning();

  for (const userId of [alice!.id, bob!.id, carol!.id]) {
    await db.insert(schema.groupMembers).values({ groupId: group!.id, userId }).onConflictDoNothing();
  }

  // Idempotent re-seed.
  await db.delete(schema.expenses).where(eq(schema.expenses.groupId, group!.id));

  // Alice paid 600,000 for dinner (3-way).
  const dinner = splitEvenly(60_000_000, 3);
  const [dinnerExp] = await db
    .insert(schema.expenses)
    .values({ groupId: group!.id, payerId: alice!.id, amountCents: 60_000_000, currency: "IRT", description: "شام" })
    .returning();
  await db.insert(schema.expenseShares).values([
    { expenseId: dinnerExp!.id, userId: alice!.id, amountCents: dinner[0]!, description: "قورمه" },
    { expenseId: dinnerExp!.id, userId: bob!.id, amountCents: dinner[1]!, description: "کباب" },
    { expenseId: dinnerExp!.id, userId: carol!.id, amountCents: dinner[2]!, description: "جوجه" },
  ]);

  // Bob paid 300,000 for taxi (Bob + Carol).
  const taxi = splitEvenly(30_000_000, 2);
  const [taxiExp] = await db
    .insert(schema.expenses)
    .values({ groupId: group!.id, payerId: bob!.id, amountCents: 30_000_000, currency: "IRT", description: "تاکسی" })
    .returning();
  await db.insert(schema.expenseShares).values([
    { expenseId: taxiExp!.id, userId: bob!.id, amountCents: taxi[0]! },
    { expenseId: taxiExp!.id, userId: carol!.id, amountCents: taxi[1]! },
  ]);

  // Direct debt: Carol owes Alice 150,000 (modeled as Alice paid, Carol's share).
  const [debtExp] = await db
    .insert(schema.expenses)
    .values({ groupId: group!.id, payerId: alice!.id, amountCents: 15_000_000, currency: "IRT", description: "وام", kind: "debt" })
    .returning();
  await db.insert(schema.expenseShares).values({
    expenseId: debtExp!.id,
    userId: carol!.id,
    amountCents: 15_000_000,
  });

  console.log(`✅ Seeded "${group!.title}" (id ${group!.id}) — 3 members, 3 records.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
