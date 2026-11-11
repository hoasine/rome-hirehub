import type { Address } from "viem";

export type WalletKind = "rome" | "evm" | "solana";
export type WorkStatus = "pending" | "approved" | "rejected";
export type EngagementStatus =
  | "proposed"
  | "accepted"
  | "submitted"
  | "revision-requested"
  | "completed"
  | "rejected"
  | "cancelled"
  | "disputed";

export interface WalletIdentity {
  address: Address;
  label: string;
  kind: WalletKind;
}

export interface Profile {
  id: bigint;
  owner: Address;
  displayName: string;
  headline: string;
  bio: string;
  avatarUrl: string;
  createdAt: number;
  workCount: number;
  attestationCount: number;
  wallets: WalletIdentity[];
}

export interface WorkRecord {
  id: bigint;
  profileId: bigint;
  contributor: Address;
  employer: Address;
  title: string;
  description: string;
  evidenceUrl: string;
  review: string;
  createdAt: number;
  reviewedAt: number;
  rating: number;
  status: WorkStatus;
}

export interface TokenInfo {
  address: Address;
  decimals: number;
  symbol: string;
}

export interface Engagement {
  id: bigint;
  employerProfileId: bigint;
  contributorProfileId: bigint;
  employer: Address;
  contributor: Address;
  paymentToken: Address;
  paymentAmount: bigint;
  token: TokenInfo | null;
  title: string;
  description: string;
  evidenceUri: string;
  evidenceHash: `0x${string}`;
  review: string;
  createdAt: number;
  updatedAt: number;
  rating: number;
  status: EngagementStatus;
}

export type TransactionState =
  | { status: "idle" }
  | { status: "preparing"; message: string }
  | { status: "signing"; message: string }
  | { status: "confirming"; message: string; hash?: `0x${string}` }
  | { status: "success"; message: string; hash?: `0x${string}` }
  | { status: "error"; message: string };
