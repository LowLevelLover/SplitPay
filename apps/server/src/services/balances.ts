import type { BalanceDTO, GroupSummaryDTO } from "@split-pay/shared";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { AppError } from "../lib/errors.js";
import { getGroupDTO } from "./groups.js";
import { minimizeTransactions } from "./settlement.js";
import { getActiveSettlement } from "./settlements.js";
import { toUserDTO } from "./users.js";

/**
 * Net balance per member: (total paid) − (total of their shares).
 * Positive = owed money; negative = owes.
 */
export async function computeBalances(groupId: string): Promise<BalanceDTO[]> {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, groupId),
    with: {
      members: { with: { user: true } },
      expenses: { with: { payer: true, shares: { with: { user: true } } } },
    },
  });
  if (!group) throw new AppError("Group not found", 404);

  const net = new Map<string, number>();
  const add = (id: string, delta: number) => net.set(id, (net.get(id) ?? 0) + delta);

  for (const m of group.members) add(m.userId, 0);
  for (const e of group.expenses) {
    add(e.payerId, e.amountCents);
    for (const s of e.shares) add(s.userId, -s.amountCents);
  }

  const usersById = new Map(group.members.map((m) => [m.userId, m.user]));

  const balances: BalanceDTO[] = [];
  for (const [userId, netCents] of net) {
    const user = usersById.get(userId);
    if (user) balances.push({ user: toUserDTO(user), netCents });
  }
  return balances;
}

/** Everything the Mini App needs for a group. */
export async function getGroupSummary(groupId: string): Promise<GroupSummaryDTO> {
  const [group, balances, dbGroup, activeSettlement] = await Promise.all([
    getGroupDTO(groupId),
    computeBalances(groupId),
    db.query.groups.findFirst({ where: eq(schema.groups.id, groupId) }),
    getActiveSettlement(groupId),
  ]);

  return {
    group,
    balances,
    suggestions: minimizeTransactions(balances),
    currency: dbGroup?.currency ?? "IRT",
    activeSettlement,
  };
}
