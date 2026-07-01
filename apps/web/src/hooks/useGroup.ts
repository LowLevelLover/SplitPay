import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";

/** Group summary: members, balances, and who-pays-whom suggestions. */
export function useGroupSummary(groupId: string | null) {
  return useQuery({
    queryKey: ["group-summary", groupId],
    queryFn: () => api.getGroupSummary(groupId!),
    enabled: !!groupId,
  });
}

/** Expense history for a group. */
export function useExpenses(groupId: string | null) {
  return useQuery({
    queryKey: ["expenses", groupId],
    queryFn: () => api.getExpenses(groupId!),
    enabled: !!groupId,
  });
}
