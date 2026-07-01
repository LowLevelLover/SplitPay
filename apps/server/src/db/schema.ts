import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import { integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

// All money is integer minor units (cents).
const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());

export const users = pgTable("users", {
  id: id(),
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const groups = pgTable("groups", {
  id: id(),
  telegramChatId: text("telegram_chat_id").notNull().unique(),
  title: text("title"),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const groupMembers = pgTable(
  "group_members",
  {
    id: id(),
    groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.groupId, t.userId)],
);

// An expense = payer paid `amountCents`, split into shares. A direct debt is
// just an expense with a single share.
export const expenses = pgTable("expenses", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  payerId: text("payer_id").notNull().references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const expenseShares = pgTable(
  "expense_shares",
  {
    id: id(),
    expenseId: text("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    amountCents: integer("amount_cents").notNull(),
  },
  (t) => [unique().on(t.expenseId, t.userId)],
);

// Relations for the query API (db.query.*.findMany({ with: ... })).
export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  expenses: many(expenses),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, { fields: [groupMembers.groupId], references: [groups.id] }),
  user: one(users, { fields: [groupMembers.userId], references: [users.id] }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, { fields: [expenses.groupId], references: [groups.id] }),
  payer: one(users, { fields: [expenses.payerId], references: [users.id] }),
  shares: many(expenseShares),
}));

export const expenseSharesRelations = relations(expenseShares, ({ one }) => ({
  expense: one(expenses, { fields: [expenseShares.expenseId], references: [expenses.id] }),
  user: one(users, { fields: [expenseShares.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
