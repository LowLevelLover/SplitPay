import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateExpenseInput,
  CreateManualSettlementInput,
  CreateSettlementInput,
} from "@split-pay/shared";
import { api } from "../lib/api.js";

/** Groups + members for the login screen. */
export function useAdminGroups() {
  return useQuery({ queryKey: ["admin-groups"], queryFn: api.getAdminGroups });
}

/** The caller's saved TON address. */
export function useWallet() {
  return useQuery({ queryKey: ["wallet"], queryFn: api.getWallet });
}

/** Live escrow state; polls every 10s until released. */
export function useEscrowStatus(settlementId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["escrow-status", settlementId],
    queryFn: () => api.getEscrowStatus(settlementId!),
    enabled: !!settlementId && enabled,
    refetchInterval: (query) => (query.state.data?.released ? false : 10_000),
  });
}

/** Group summary: members, balances, who-pays-whom, active settlement. */
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

/** Invalidate everything that depends on a group's ledger/settlement state. */
function useGroupInvalidator(groupId: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["group-summary", groupId] });
    qc.invalidateQueries({ queryKey: ["expenses", groupId] });
  };
}

export function useCreateExpense(groupId: string | null) {
  const invalidate = useGroupInvalidator(groupId);
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => api.createExpense(input),
    onSuccess: invalidate,
  });
}

export function useSaveWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tonAddress: string) => api.saveWallet(tonAddress),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallet"] }),
  });
}

export function useCreateSettlement(groupId: string | null) {
  const invalidate = useGroupInvalidator(groupId);
  return useMutation({
    mutationFn: (input: CreateSettlementInput) => api.createSettlement(input),
    onSuccess: invalidate,
  });
}

export function useAgreeSettlement(groupId: string | null) {
  const invalidate = useGroupInvalidator(groupId);
  return useMutation({
    mutationFn: (id: string) => api.agreeSettlement(id),
    onSuccess: invalidate,
  });
}

export function useConfirmDeposit(groupId: string | null) {
  const invalidate = useGroupInvalidator(groupId);
  return useMutation({
    mutationFn: (id: string) => api.confirmDeposit(id),
    onSuccess: invalidate,
  });
}

export function useCreateManualSettlement(groupId: string | null) {
  const invalidate = useGroupInvalidator(groupId);
  return useMutation({
    mutationFn: (input: CreateManualSettlementInput) => api.createManualSettlement(input),
    onSuccess: invalidate,
  });
}

export function useConfirmManualSettlement(groupId: string | null) {
  const invalidate = useGroupInvalidator(groupId);
  return useMutation({
    mutationFn: (id: string) => api.confirmManualSettlement(id),
    onSuccess: invalidate,
  });
}

export function useRejectManualSettlement(groupId: string | null) {
  const invalidate = useGroupInvalidator(groupId);
  return useMutation({
    mutationFn: (id: string) => api.rejectManualSettlement(id),
    onSuccess: invalidate,
  });
}
