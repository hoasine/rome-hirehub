import type { Profile, WorkRecord } from "./types";

export const demoProfiles: Profile[] = [
  {
    id: 1n,
    owner: "0x7f2D39e2a45D7484aA65f6B63F1f94E2a851D5Af",
    displayName: "Mina Park",
    headline: "Cross-VM product engineer",
    bio: "I build simple interfaces for complicated on-chain systems. Solidity, TypeScript, and Solana integrations.",
    avatarUrl: "",
    createdAt: 1793401200,
    workCount: 3,
    attestationCount: 2,
    completedAgreements: 2,
    wallets: [
      {
        address: "0x7f2D39e2a45D7484aA65f6B63F1f94E2a851D5Af",
        label: "EVM",
        kind: "evm",
      },
      {
        address: "0x99235f50A5F0E9345cfA83a99aBDF3FaD754C9a1",
        label: "Solana synthetic",
        kind: "solana",
      },
    ],
  },
  {
    id: 2n,
    owner: "0x3Fa6E34B41DC1Ce583F64F7B495AD35DdE76E813",
    displayName: "Ishan Rao",
    headline: "Smart contract & protocol designer",
    bio: "Security-minded Solidity developer focused on clear invariants, testing, and composable DeFi.",
    avatarUrl: "",
    createdAt: 1793228400,
    workCount: 4,
    attestationCount: 4,
    completedAgreements: 3,
    wallets: [
      {
        address: "0x3Fa6E34B41DC1Ce583F64F7B495AD35DdE76E813",
        label: "EVM",
        kind: "evm",
      },
    ],
  },
  {
    id: 3n,
    owner: "0xA8642Fd55193D34FD987D4DeFA60F3a55f7919b0",
    displayName: "Linh Nguyen",
    headline: "Community systems & data",
    bio: "I turn community work into verifiable records, useful dashboards, and fair reward systems.",
    avatarUrl: "",
    createdAt: 1792969200,
    workCount: 2,
    attestationCount: 1,
    completedAgreements: 1,
    wallets: [
      {
        address: "0xA8642Fd55193D34FD987D4DeFA60F3a55f7919b0",
        label: "Solana synthetic",
        kind: "solana",
      },
    ],
  },
];

export const demoWork: WorkRecord[] = [
  {
    id: 1n,
    profileId: 1n,
    contributor: demoProfiles[0].owner,
    employer: "0x11fF71832FcaA9B84E8F6E54F02ddBB7345Ef899",
    title: "Rome dual-wallet onboarding",
    description: "Designed and shipped a guided onboarding flow for EVM and Solana wallets.",
    evidenceUrl: "https://github.com/rome-protocol",
    review: "Clear UX and excellent delivery. Every edge state was documented.",
    createdAt: 1793410000,
    reviewedAt: 1793496400,
    rating: 5,
    status: "approved",
  },
  {
    id: 2n,
    profileId: 1n,
    contributor: demoProfiles[0].owner,
    employer: "0x48bc683C76917129AbD5C0cc32B9d740f34B856D",
    title: "Bridge activity dashboard",
    description: "Built a transaction milestone view with resumable transfer URLs.",
    evidenceUrl: "https://github.com/rome-protocol",
    review: "Awaiting final employer review.",
    createdAt: 1793572800,
    reviewedAt: 0,
    rating: 0,
    status: "pending",
  },
];
