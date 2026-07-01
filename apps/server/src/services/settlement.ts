import type { BalanceDTO, SettlementSuggestion } from "@split-pay/shared";

// Greedy: match biggest debtor with biggest creditor, transfer the smaller
// magnitude, repeat. Near-optimal (exact min is NP-hard); balances net to zero.
export function minimizeTransactions(balances: BalanceDTO[]): SettlementSuggestion[] {
  const debtors = balances.filter((b) => b.netCents < 0).map((b) => ({ ...b }));
  const creditors = balances.filter((b) => b.netCents > 0).map((b) => ({ ...b }));

  // Largest magnitude first.
  debtors.sort((a, b) => a.netCents - b.netCents); // most negative first
  creditors.sort((a, b) => b.netCents - a.netCents); // most positive first

  const suggestions: SettlementSuggestion[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i]!;
    const creditor = creditors[j]!;
    const amount = Math.min(-debtor.netCents, creditor.netCents);

    if (amount > 0) {
      suggestions.push({ from: debtor.user, to: creditor.user, amountCents: amount });
      debtor.netCents += amount;
      creditor.netCents -= amount;
    }

    if (debtor.netCents === 0) i++;
    if (creditor.netCents === 0) j++;
  }

  return suggestions;
}
