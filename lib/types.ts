import type { Address } from "viem";

export type WalletKind = "evm" | "solana";
export type WorkStatus = "pending" | "approved" | "rejected";

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

export type TransactionState =
  | { status: "idle" }
  | { status: "preparing"; message: string }
  | { status: "signing"; message: string }
  | { status: "confirming"; message: string; hash?: `0x${string}` }
  | { status: "success"; message: string; hash?: `0x${string}` }
  | { status: "error"; message: string };
