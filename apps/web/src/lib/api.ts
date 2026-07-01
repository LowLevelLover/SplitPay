import type {
  CreateExpenseInput,
  ExpenseDTO,
  GroupSummaryDTO,
} from "@split-pay/shared";
import { getInitData } from "./telegram.js";

// Fetch wrapper: every request carries initData in X-Init-Data for auth.
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Init-Data": getInitData(),
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
  getGroupSummary: (groupId: string) =>
    request<GroupSummaryDTO>(`/api/groups/${groupId}/summary`),

  getExpenses: (groupId: string) =>
    request<ExpenseDTO[]>(`/api/groups/${groupId}/expenses`),

  createExpense: (input: CreateExpenseInput) =>
    request<ExpenseDTO>(`/api/expenses`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
