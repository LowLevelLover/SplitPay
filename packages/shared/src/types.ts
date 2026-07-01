/**
 * Domain & wire types shared between the server and the Mini App.
 *
 * Convention: all monetary values are INTEGER MINOR UNITS (e.g. cents).
 * Never send or store floating-point money.
 */

export interface UserDTO {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string;
}

export interface GroupDTO {
  id: string;
  title: string | null;
  members: UserDTO[];
}

export interface ExpenseDTO {
  id: string;
  groupId: string;
  payer: UserDTO;
  amountCents: number;
  currency: string;
  description: string | null;
  participants: UserDTO[];
  createdAt: string; // ISO 8601
}

/** Net position of one member in a group: positive = is owed, negative = owes. */
export interface BalanceDTO {
  user: UserDTO;
  netCents: number;
}

/** A single "who pays whom" transfer produced by the settlement minimizer. */
export interface SettlementSuggestion {
  from: UserDTO;
  to: UserDTO;
  amountCents: number;
}

export interface GroupSummaryDTO {
  group: GroupDTO;
  balances: BalanceDTO[];
  suggestions: SettlementSuggestion[];
  currency: string;
}
