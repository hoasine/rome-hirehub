import {
  createPublicClient,
  encodeFunctionData,
  http,
  type Address,
  type Hex,
} from "viem";
import { hireHubAbi } from "./abi";
import { HIREHUB_ADDRESS, hadrian } from "./config";
import type { Profile, WorkRecord, WorkStatus } from "./types";

export const publicClient = createPublicClient({
  chain: hadrian,
  transport: http(),
});

function requireContract() {
  if (!HIREHUB_ADDRESS) {
    throw new Error("HireHub is running in preview mode. Configure NEXT_PUBLIC_HIREHUB_ADDRESS.");
  }
  return HIREHUB_ADDRESS;
}

export async function loadProfiles(): Promise<Profile[]> {
  const address = requireContract();
  const count = await publicClient.readContract({
    address,
    abi: hireHubAbi,
    functionName: "profileCount",
  });

  const ids = Array.from({ length: Number(count) }, (_, index) => BigInt(index + 1));
  return Promise.all(ids.map(loadProfile));
}

export async function loadProfile(profileId: bigint): Promise<Profile> {
  const address = requireContract();
  const [raw, wallets] = await Promise.all([
    publicClient.readContract({
      address,
      abi: hireHubAbi,
      functionName: "getProfile",
      args: [profileId],
    }),
    publicClient.readContract({
      address,
      abi: hireHubAbi,
      functionName: "getProfileWallets",
      args: [profileId],
    }),
  ]);

  return {
    id: profileId,
    owner: raw.owner,
    displayName: raw.displayName,
    headline: raw.headline,
    bio: raw.bio,
    avatarUrl: raw.avatarUrl,
    createdAt: Number(raw.createdAt),
    workCount: Number(raw.workCount),
    attestationCount: Number(raw.attestationCount),
    wallets: wallets.map((wallet, index) => ({
      address: wallet,
      label: index === 0 ? "Profile owner" : "Consent-linked address",
      // The v1 registry stores Rome addresses, not wallet provenance. The UI
      // upgrades a connected synthetic address to "solana" when it can prove it.
      kind: "rome" as const,
    })),
  };
}

export async function loadProfileWork(profileId: bigint): Promise<WorkRecord[]> {
  const address = requireContract();
  const ids = await publicClient.readContract({
    address,
    abi: hireHubAbi,
    functionName: "getProfileWorkIds",
    args: [profileId],
  });

  return Promise.all(
    ids.map(async (id) => {
      const raw = await publicClient.readContract({
        address,
        abi: hireHubAbi,
        functionName: "getWork",
        args: [id],
      });
      const statuses: WorkStatus[] = ["pending", "approved", "rejected"];
      return {
        id,
        profileId: raw.profileId,
        contributor: raw.contributor,
        employer: raw.employer,
        title: raw.title,
        description: raw.description,
        evidenceUrl: raw.evidenceUrl,
        review: raw.review,
        createdAt: Number(raw.createdAt),
        reviewedAt: Number(raw.reviewedAt),
        rating: Number(raw.rating),
        status: statuses[raw.status] ?? "pending",
      };
    }),
  );
}

export async function profileIdForWallet(wallet: Address) {
  return publicClient.readContract({
    address: requireContract(),
    abi: hireHubAbi,
    functionName: "profileOfWallet",
    args: [wallet],
  });
}

export async function findPendingWalletLinkProfiles(wallet: Address) {
  const address = requireContract();
  const count = await publicClient.readContract({
    address,
    abi: hireHubAbi,
    functionName: "profileCount",
  });
  const checks = Array.from({ length: Number(count) }, async (_, index) => {
    const profileId = BigInt(index + 1);
    const pending = await publicClient.readContract({
      address,
      abi: hireHubAbi,
      functionName: "pendingWalletLinks",
      args: [profileId, wallet],
    });
    return pending ? profileId : null;
  });
  return (await Promise.all(checks)).filter(
    (profileId): profileId is bigint => profileId !== null,
  );
}

export async function loadEmployerInbox(wallet: Address): Promise<WorkRecord[]> {
  const address = requireContract();
  const count = await publicClient.readContract({
    address,
    abi: hireHubAbi,
    functionName: "workCount",
  });
  const records = await Promise.all(
    Array.from({ length: Number(count) }, async (_, index): Promise<WorkRecord | null> => {
      const id = BigInt(index + 1);
      const raw = await publicClient.readContract({
        address,
        abi: hireHubAbi,
        functionName: "getWork",
        args: [id],
      });
      if (
        raw.employer.toLowerCase() !== wallet.toLowerCase() ||
        raw.status !== 0
      ) {
        return null;
      }
      return {
        id,
        profileId: raw.profileId,
        contributor: raw.contributor,
        employer: raw.employer,
        title: raw.title,
        description: raw.description,
        evidenceUrl: raw.evidenceUrl,
        review: raw.review,
        createdAt: Number(raw.createdAt),
        reviewedAt: Number(raw.reviewedAt),
        rating: Number(raw.rating),
        status: "pending",
      };
    }),
  );
  return records.filter((record): record is WorkRecord => record !== null);
}

export function encodeHireHubCall(
  functionName:
    | "createProfile"
    | "updateProfile"
    | "proposeWallet"
    | "cancelWalletProposal"
    | "acceptWalletLink"
    | "submitWork"
    | "reviewWork",
  args: readonly unknown[],
): Hex {
  return encodeFunctionData({
    abi: hireHubAbi,
    functionName,
    // The function name narrows the runtime ABI; form values are validated before encoding.
    args: args as never,
  });
}
