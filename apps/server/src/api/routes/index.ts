import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth/authenticate.js";
import { assertMembership, getGroupDTO } from "../../services/groups.js";
import { getGroupSummary } from "../../services/balances.js";
import { createExpense, listExpenses } from "../../services/expenses.js";
import { createExpenseSchema } from "@split-pay/shared";

// Mini App REST routes under /api. Each authenticates via initData and checks
// group membership before returning data.
export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  // Group profile + members.
  app.get<{ Params: { groupId: string } }>("/api/groups/:groupId", async (req) => {
    const { userId } = await authenticate(req);
    await assertMembership(req.params.groupId, userId);
    return getGroupDTO(req.params.groupId);
  });

  // Balances + settlement suggestions — the Mini App's main screen.
  app.get<{ Params: { groupId: string } }>("/api/groups/:groupId/summary", async (req) => {
    const { userId } = await authenticate(req);
    await assertMembership(req.params.groupId, userId);
    return getGroupSummary(req.params.groupId);
  });

  // Expense history.
  app.get<{ Params: { groupId: string } }>("/api/groups/:groupId/expenses", async (req) => {
    const { userId } = await authenticate(req);
    await assertMembership(req.params.groupId, userId);
    return listExpenses(req.params.groupId);
  });

  // Create an expense from the Mini App.
  app.post("/api/expenses", async (req) => {
    const { userId } = await authenticate(req);
    const input = createExpenseSchema.parse(req.body);
    await assertMembership(input.groupId, userId);
    return createExpense(input);
  });
}
