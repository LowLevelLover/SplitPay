import type {
  CreateExpenseInput,
  CreateManualSettlementInput,
  CreateSettlementInput,
  ExpenseDTO,
  GroupSummaryDTO,
  ManualSettlementDTO,
  SettlementDTO,
} from "@split-pay/shared";
import { getDevUser, getInitData } from "./telegram.js";

/** Deposit instruction for a debtor (from GET /settlements/:id/deposit). */
export interface DepositInstruction {
  address: string;
  amountNano: string;
  comment: string;
  asset: "TON" | "USDT";
}

// Fetch wrapper: every request carries initData in X-Init-Data for auth.
// In the local admin panel (?devUser=…) it sends X-Dev-User instead.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const devUser = getDevUser();
  const hasBody = options.body !== undefined && options.body !== null;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(devUser ? { "X-Dev-User": devUser } : { "X-Init-Data": getInitData() }),
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
  getGroupSummary: (groupId: string) => request<GroupSummaryDTO>(`/api/groups/${groupId}/summary`),

  getExpenses: (groupId: string) => request<ExpenseDTO[]>(`/api/groups/${groupId}/expenses`),

  createExpense: (input: CreateExpenseInput) =>
    request<ExpenseDTO>(`/api/expenses`, { method: "POST", body: JSON.stringify(input) }),

  saveWallet: (tonAddress: string) =>
    request<{ ok: boolean }>(`/api/wallet`, {
      method: "POST",
      body: JSON.stringify({ tonAddress }),
    }),

  createSettlement: (input: CreateSettlementInput) =>
    request<SettlementDTO>(`/api/settlements`, { method: "POST", body: JSON.stringify(input) }),

  getSettlement: (id: string) => request<SettlementDTO>(`/api/settlements/${id}`),

  agreeSettlement: (id: string) =>
    request<SettlementDTO>(`/api/settlements/${id}/agree`, { method: "POST" }),

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
