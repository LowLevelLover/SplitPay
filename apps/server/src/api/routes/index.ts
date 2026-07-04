import type { FastifyInstance } from "fastify";
import type { Bot } from "grammy";
import {
  createExpenseSchema,
  createManualSettlementSchema,
  createSettlementSchema,
  saveWalletSchema,
} from "@split-pay/shared";
import type { SplitPayContext } from "../../bot/context.js";
import { authenticate } from "../auth/authenticate.js";
import { assertMembership, getGroupChatId, getGroupDTO } from "../../services/groups.js";
import { getGroupSummary } from "../../services/balances.js";
import { createExpense, listExpenses } from "../../services/expenses.js";
import { getUserById, saveTonAddress, toUserDTO } from "../../services/users.js";
import {
  agreeSettlement,
  confirmCallerDeposit,
  createSettlement,
  getDepositInstruction,
  getEscrowStatus,
  getSettlement,
} from "../../services/settlements.js";
import {
  confirmManualSettlement,
  createManualSettlement,
  rejectManualSettlement,
} from "../../services/manualSettlements.js";
import { sendManualSettlementRequest } from "../../bot/notify.js";

// Mini App REST routes under /api. Each authenticates via initData and checks
// group membership before returning data.
export async function registerApiRoutes(
  app: FastifyInstance,
  bot: Bot<SplitPayContext>,
): Promise<void> {
  // The authenticated caller's profile.
  app.get("/api/me", async (req) => {
    const { userId } = await authenticate(req);
    return toUserDTO(await getUserById(userId));
  });

  // The caller's saved settlement address.
  app.get("/api/wallet", async (req) => {
    const { userId } = await authenticate(req);
    const user = await getUserById(userId);
    return { tonAddress: user.tonAddress ?? null };
  });

  // Group profile + members.
  app.get<{ Params: { groupId: string } }>("/api/groups/:groupId", async (req) => {
    const { userId } = await authenticate(req);
    await assertMembership(req.params.groupId, userId);
    return getGroupDTO(req.params.groupId);
  });

  // Balances + settlement suggestions + active settlement — main screen.
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

  // Create an expense from the Mini App (equal / percent / exact split).
  app.post("/api/expenses", async (req) => {
    const { userId } = await authenticate(req);
    const input = createExpenseSchema.parse(req.body);
    await assertMembership(input.groupId, userId);
    return createExpense(input);
  });

  // Save the caller's settlement address (manually entered).
  app.post("/api/wallet", async (req) => {
    const { userId } = await authenticate(req);
    const { tonAddress } = saveWalletSchema.parse(req.body);
    await saveTonAddress(userId, tonAddress);
    return { ok: true };
  });

  // Open a settlement: whole group, or scoped (caller pays selected members).
  app.post("/api/settlements", async (req) => {
    const { userId } = await authenticate(req);
    const input = createSettlementSchema.parse(req.body);
    await assertMembership(input.groupId, userId);
    return createSettlement(input.groupId, input.asset, {
      payerId: userId,
      toUserIds: input.toUserIds,
    });
  });

  // Live escrow state (deployment, funding progress, explorer link).
  app.get<{ Params: { id: string } }>("/api/settlements/:id/escrow-status", async (req) => {
    await authenticate(req);
    return getEscrowStatus(req.params.id);
  });

  // Poll a settlement's state.
  app.get<{ Params: { id: string } }>("/api/settlements/:id", async (req) => {
    await authenticate(req);
    return getSettlement(req.params.id);
  });

  // Click "Done" (agree). Deploys the escrow once everyone involved agrees.
  app.post<{ Params: { id: string } }>("/api/settlements/:id/agree", async (req) => {
    const { userId } = await authenticate(req);
    return agreeSettlement(req.params.id, userId);
  });

  // Deposit instruction for the caller's part (TON Connect / deep link).
  app.get<{ Params: { id: string } }>("/api/settlements/:id/deposit", async (req) => {
    const { userId } = await authenticate(req);
    return getDepositInstruction(req.params.id, userId);
  });

  // Confirm the caller funded their part (sim / manual path).
  app.post<{ Params: { id: string } }>("/api/settlements/:id/deposit", async (req) => {
    const { userId } = await authenticate(req);
    return confirmCallerDeposit(req.params.id, userId);
  });

  // ── Manual (off-app) settle-ups ─────────────────────────────────────────────
  // Record "I paid X" as pending, then ask the recipient (via bot) to confirm.
  app.post("/api/settlements/manual", async (req) => {
    const { userId } = await authenticate(req);
    const input = createManualSettlementSchema.parse(req.body);
    await assertMembership(input.groupId, userId);
    const dto = await createManualSettlement({
      groupId: input.groupId,
      fromUserId: userId,
      toUserId: input.toUserId,
      amountCents: input.amountCents,
      note: input.note ?? null,
    });
    const chatId = await getGroupChatId(input.groupId);
    if (chatId) {
      try {
        await sendManualSettlementRequest(bot.api, dto, chatId);
      } catch (err) {
        app.log.warn({ err }, "settle-up approval message failed");
      }
    }
    return dto;
  });

  // Recipient confirms a settle-up → clears the debt.
  app.post<{ Params: { id: string } }>("/api/settlements/manual/:id/confirm", async (req) => {
    const { userId } = await authenticate(req);
    return confirmManualSettlement(req.params.id, userId);
  });

  // Recipient rejects a settle-up.
  app.post<{ Params: { id: string } }>("/api/settlements/manual/:id/reject", async (req) => {
    const { userId } = await authenticate(req);
    return rejectManualSettlement(req.params.id, userId);
  });
}
