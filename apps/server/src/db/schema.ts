import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

// All money is integer minor units (cents).
const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());

export const users = pgTable("users", {
  id: id(),
  // For members mentioned before they message the bot, this holds a
  // "pending:<username>" placeholder until they sign in and it's relinked.
  telegramId: text("telegram_id").notNull().unique(),
  username: text("username"),
  firstName: text("first_name").notNull(),
  tonAddress: text("ton_address"),
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
  currency: text("currency").notNull().default("IRT"),
  description: text("description"),
  // expense = normal split | debt = direct "X owes Y" | settlement = on-chain payoff
  kind: text("kind").notNull().default("expense"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const expenseShares = pgTable(
  "expense_shares",
  {
    id: id(),
    expenseId: text("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    amountCents: integer("amount_cents").notNull(),
    description: text("description"), // per-item label from a ledger message
  },
  (t) => [unique().on(t.expenseId, t.userId)],
);

// A settlement snapshots the minimized debt graph and drives on-chain payoff.
export const settlements = pgTable("settlements", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("proposed"),
  asset: text("asset").notNull().default("TON"),
  contractAddress: text("contract_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settlementTransfers = pgTable("settlement_transfers", {
  id: id(),
  settlementId: text("settlement_id")
    .notNull()
    .references(() => settlements.id, { onDelete: "cascade" }),
  fromUserId: text("from_user_id").notNull().references(() => users.id),
  toUserId: text("to_user_id").notNull().references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
  paid: boolean("paid").notNull().default(false),
  txHash: text("tx_hash"),
});

// One row per involved member who clicked "Done".
export const settlementAgreements = pgTable(
  "settlement_agreements",
  {
    id: id(),
    settlementId: text("settlement_id")
      .notNull()
      .references(() => settlements.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id),
    agreedAt: timestamp("agreed_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.settlementId, t.userId)],
);

// A manual (off-app) settle-up: one member says they paid another directly
// (cash/transfer). Pending until the recipient confirms; on confirm it spawns an
// offsetting "settlement" expense so balances net down. Kept off the on-chain path.
export const manualSettlements = pgTable("manual_settlements", {
  id: id(),
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
  fromUserId: text("from_user_id").notNull().references(() => users.id),
  toUserId: text("to_user_id").notNull().references(() => users.id),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("IRT"),
  status: text("status").notNull().default("pending"), // pending | confirmed | rejected
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

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

export const settlementsRelations = relations(settlements, ({ one, many }) => ({
  group: one(groups, { fields: [settlements.groupId], references: [groups.id] }),
  transfers: many(settlementTransfers),
  agreements: many(settlementAgreements),
}));

export const settlementTransfersRelations = relations(settlementTransfers, ({ one }) => ({
  settlement: one(settlements, {
    fields: [settlementTransfers.settlementId],
    references: [settlements.id],
  }),
  from: one(users, { fields: [settlementTransfers.fromUserId], references: [users.id] }),
  to: one(users, { fields: [settlementTransfers.toUserId], references: [users.id] }),
}));

export const settlementAgreementsRelations = relations(settlementAgreements, ({ one }) => ({
  settlement: one(settlements, {
    fields: [settlementAgreements.settlementId],
    references: [settlements.id],
  }),
  user: one(users, { fields: [settlementAgreements.userId], references: [users.id] }),
}));

export const manualSettlementsRelations = relations(manualSettlements, ({ one }) => ({
  group: one(groups, { fields: [manualSettlements.groupId], references: [groups.id] }),
  from: one(users, { fields: [manualSettlements.fromUserId], references: [users.id] }),
  to: one(users, { fields: [manualSettlements.toUserId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type ManualSettlement = typeof manualSettlements.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Settlement = typeof settlements.$inferSelect;
export type SettlementTransfer = typeof settlementTransfers.$inferSelect;
