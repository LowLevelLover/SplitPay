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
  /** Saved TON settlement address (entered manually); null until provided. */
  tonAddress: string | null;
}

/** The caller's saved settlement address. */
export interface WalletDTO {
  tonAddress: string | null;
}

export interface GroupDTO {
  id: string;
  title: string | null;
  members: UserDTO[];
}

export interface ExpenseShareDTO {
  user: UserDTO;
  amountCents: number;
  description: string | null; // per-item label (e.g. "قورمه")
}

export interface ExpenseDTO {
  id: string;
  groupId: string;
  payer: UserDTO;
  amountCents: number;
  currency: string;
  description: string | null;
  participants: UserDTO[];
  shares: ExpenseShareDTO[];
  /** How this expense was split; how the bot classified the source message. */
  kind: "expense" | "debt" | "settlement";
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

export type ManualSettlementStatus = "pending" | "confirmed" | "rejected";

/** An off-app payment one member says they made to another; needs the recipient's OK. */
export interface ManualSettlementDTO {
  id: string;
  groupId: string;
  from: UserDTO;
  to: UserDTO;
  amountCents: number;
  currency: string;
  status: ManualSettlementStatus;
  note: string | null;
  createdAt: string; // ISO 8601
  confirmedAt: string | null;
}

export interface GroupSummaryDTO {
  group: GroupDTO;
  balances: BalanceDTO[];
  suggestions: SettlementSuggestion[];
  currency: string;
  /** The open settlement for this group, if one is in progress. */
  activeSettlement: SettlementDTO | null;
  /** Manual off-app settle-ups (pending/confirmed/rejected), most recent first. */
  manualSettlements: ManualSettlementDTO[];
}

/** On-chain assets the escrow supports. */
export type SettlementAsset = "TON" | "USDT";

/**
 * proposed  → collecting Done/agreements from involved members
 * agreed    → everyone agreed; escrow deploy requested
 * deployed  → escrow live on-chain, waiting for debtor deposits
 * released  → contract funded and paid out to creditors; debts cleared
 * cancelled → aborted before completion
 */
export type SettlementStatus =
  | "proposed"
  | "agreed"
  | "deployed"
  | "released"
  | "cancelled";

/** One debtor→creditor transfer in a settlement (snapshot of the graph). */
export interface SettlementTransferDTO {
  id: string;
  from: UserDTO;
  to: UserDTO;
  amountCents: number;
  paid: boolean;
  txHash: string | null;
}

/** Live on-chain (or simulated) state of a settlement's escrow. */
export interface EscrowStatusDTO {
  settlementId: string;
  /** Escrow account address; null until deployed. */
  address: string | null;
  network: "sim" | "testnet" | "mainnet";
  deployed: boolean;
  /** Current escrow balance, base units (nanoton). */
  balanceNano: string;
  /** Total deposits needed to cover every transfer, base units. */
  requiredNano: string;
  fundedTransferIds: string[];
  released: boolean;
  /** Block-explorer link for the escrow account; null in sim. */
  explorerUrl: string | null;
}

export interface SettlementDTO {
  id: string;
  groupId: string;
  status: SettlementStatus;
  asset: SettlementAsset;
  transfers: SettlementTransferDTO[];
  /** Members who must click Done: everyone appearing in a transfer. */
  involved: UserDTO[];
  /** User ids that have clicked Done. */
  agreedUserIds: string[];
  /** Escrow contract address once deployed. */
  contractAddress: string | null;
  createdAt: string;
}
