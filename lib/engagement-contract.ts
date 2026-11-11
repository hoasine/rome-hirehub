import { encodeFunctionData, formatUnits, type Address, type Hex } from "viem";
import { engagementAbi, erc20Abi } from "./engagement-abi";
import { HIREHUB_ENGAGEMENTS_ADDRESS } from "./config";
import { publicClient } from "./contract";
import type { Engagement, EngagementStatus, TokenInfo } from "./types";

const statuses: EngagementStatus[] = [
  "proposed",
  "accepted",
  "submitted",
  "revision-requested",
  "completed",
  "rejected",
  "cancelled",
  "disputed",
];

export const STALE_AFTER_SECONDS = 30 * 24 * 60 * 60;

const tokenCache = new Map<string, Promise<TokenInfo>>();

function requireEngagementContract() {
  if (!HIREHUB_ENGAGEMENTS_ADDRESS) {
    throw new Error(
      "The bilateral engagement companion is not deployed or configured yet.",
    );
  }
  return HIREHUB_ENGAGEMENTS_ADDRESS;
}

export function loadTokenInfo(token: Address): Promise<TokenInfo> {
  const key = token.toLowerCase();
  const cached = tokenCache.get(key);
  if (cached) return cached;
  const request = Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
    publicClient
      .readContract({ address: token, abi: erc20Abi, functionName: "symbol" })
      .catch(() => "tokens"),
  ])
    .then(([decimals, symbol]) => ({ address: token, decimals: Number(decimals), symbol }))
    .catch((error: unknown) => {
      tokenCache.delete(key);
      throw error;
    });
  tokenCache.set(key, request);
  return request;
}

export async function loadAllowance(token: Address, owner: Address) {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, requireEngagementContract()],
  });
}

export async function loadTokenBalance(token: Address, owner: Address) {
  return publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

export function formatPayment(engagement: Engagement) {
  if (engagement.paymentAmount === 0n) return null;
  if (!engagement.token) return `${engagement.paymentAmount.toString()} base units`;
  return `${formatUnits(engagement.paymentAmount, engagement.token.decimals)} ${engagement.token.symbol}`;
}

export function isStale(engagement: Engagement, now = Date.now() / 1000) {
  return (
    ["accepted", "revision-requested"].includes(engagement.status) &&
    now >= engagement.updatedAt + STALE_AFTER_SECONDS
  );
}

export async function loadEngagement(id: bigint): Promise<Engagement> {
  const raw = await publicClient.readContract({
    address: requireEngagementContract(),
    abi: engagementAbi,
    functionName: "getEngagement",
    args: [id],
  });
  const token =
    raw.paymentAmount > 0n
      ? await loadTokenInfo(raw.paymentToken).catch(() => null)
      : null;
  return {
    id,
    employerProfileId: raw.employerProfileId,
    contributorProfileId: raw.contributorProfileId,
    employer: raw.employer,
    contributor: raw.contributor,
    paymentToken: raw.paymentToken,
    paymentAmount: raw.paymentAmount,
    token,
    title: raw.title,
    description: raw.description,
    evidenceUri: raw.evidenceUri,
    evidenceHash: raw.evidenceHash,
    review: raw.review,
    createdAt: Number(raw.createdAt),
    updatedAt: Number(raw.updatedAt),
    rating: Number(raw.rating),
    status: statuses[raw.status] ?? "proposed",
  };
}

export async function loadProfileEngagements(
  profileId: bigint,
): Promise<Engagement[]> {
  if (!HIREHUB_ENGAGEMENTS_ADDRESS) return [];
  const [employerIds, contributorIds] = await Promise.all([
    publicClient.readContract({
      address: HIREHUB_ENGAGEMENTS_ADDRESS,
      abi: engagementAbi,
      functionName: "getProfileEngagementIds",
      args: [profileId, true, 0n, 50n],
    }),
    publicClient.readContract({
      address: HIREHUB_ENGAGEMENTS_ADDRESS,
      abi: engagementAbi,
      functionName: "getProfileEngagementIds",
      args: [profileId, false, 0n, 50n],
    }),
  ]);
  const ids = [...new Set([...employerIds, ...contributorIds])];
  const records = await Promise.all(ids.map(loadEngagement));
  return records.sort((left, right) => right.updatedAt - left.updatedAt);
}

export function encodeEngagementCall(
  functionName:
    | "createEngagement"
    | "acceptEngagement"
    | "declineEngagement"
    | "cancelProposal"
    | "submitEvidence"
    | "requestRevision"
    | "approveEngagement"
    | "rejectEngagement"
    | "raiseDispute"
    | "withdrawEngagement"
    | "reclaimStaleEngagement",
  args: readonly unknown[],
): Hex {
  return encodeFunctionData({
    abi: engagementAbi,
    functionName,
    args: args as never,
  });
}

export function encodeApproveCall(amount: bigint): Hex {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [requireEngagementContract(), amount],
  });
}
