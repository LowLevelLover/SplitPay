import type {
  CreateExpenseInput,
  CreateManualSettlementInput,
  CreateSettlementInput,
  EscrowStatusDTO,
  ExpenseDTO,
  GroupSummaryDTO,
  ManualSettlementDTO,
  SettlementDTO,
  UserDTO,
  WalletDTO,
} from "@split-pay/shared";
import { getSession } from "./session.js";

/** Deposit instruction for a debtor (from GET /settlements/:id/deposit). */
export interface DepositInstruction {
  address: string;
  amountNano: string;
  comment: string;
  asset: "TON" | "USDT";
}

/** Login-screen listing from GET /api/admin/groups (not part of the shared DTOs). */
export interface AdminGroupDTO {
  id: string;
  title: string | null;
  members: {
    telegramId: string;
    username: string | null;
    firstName: string;
    tonAddress: string | null;
  }[];
}

// Fetch wrapper: every request identifies the caller via X-Dev-User (local dev auth).
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession();
  const hasBody = options.body !== undefined && options.body !== null;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(session ? { "X-Dev-User": session.telegramId } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getAdminGroups: () => request<AdminGroupDTO[]>(`/api/admin/groups`),

  getMe: () => request<UserDTO>(`/api/me`),

  getGroupSummary: (groupId: string) => request<GroupSummaryDTO>(`/api/groups/${groupId}/summary`),

  getExpenses: (groupId: string) => request<ExpenseDTO[]>(`/api/groups/${groupId}/expenses`),

  createExpense: (input: CreateExpenseInput) =>
    request<ExpenseDTO>(`/api/expenses`, { method: "POST", body: JSON.stringify(input) }),

  getWallet: () => request<WalletDTO>(`/api/wallet`),

  saveWallet: (tonAddress: string) =>
    request<WalletDTO>(`/api/wallet`, {
      method: "POST",
      body: JSON.stringify({ tonAddress }),
    }),

  createSettlement: (input: CreateSettlementInput) =>
    request<SettlementDTO>(`/api/settlements`, { method: "POST", body: JSON.stringify(input) }),

  getSettlement: (id: string) => request<SettlementDTO>(`/api/settlements/${id}`),

  agreeSettlement: (id: string) =>
    request<SettlementDTO>(`/api/settlements/${id}/agree`, { method: "POST" }),

  getEscrowStatus: (id: string) =>
    request<EscrowStatusDTO>(`/api/settlements/${id}/escrow-status`),

  getDeposit: (id: string) => request<DepositInstruction | null>(`/api/settlements/${id}/deposit`),

  confirmDeposit: (id: string) =>
    request<SettlementDTO>(`/api/settlements/${id}/deposit`, { method: "POST" }),

  createManualSettlement: (input: CreateManualSettlementInput) =>
    request<ManualSettlementDTO>(`/api/settlements/manual`, {
      method: "POST",
      body: JSON.stringify(input),
    }),

  confirmManualSettlement: (id: string) =>
    request<ManualSettlementDTO>(`/api/settlements/manual/${id}/confirm`, { method: "POST" }),

  rejectManualSettlement: (id: string) =>
    request<ManualSettlementDTO>(`/api/settlements/manual/${id}/reject`, { method: "POST" }),
};
