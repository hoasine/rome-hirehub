import { defineChain, getAddress, isAddress, type Address } from "viem";

export const hadrian = defineChain({
  id: 200010,
  name: "Rome Hadrian",
  nativeCurrency: { name: "Test USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://hadrian.testnet.romeprotocol.xyz/"] },
  },
  blockExplorers: {
    default: {
      name: "Via Explorer",
      url: "https://via-hadrian.testnet.romeprotocol.xyz",
    },
  },
});

export const ROME_PROGRAM_ID = "RPTWwELXAY4KC9ZPHhaxp7Sq1hHtU3HNEgLbSegCcWf";
export const SOLANA_RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

const configuredAddress = process.env.NEXT_PUBLIC_HIREHUB_ADDRESS?.trim();
const configuredEngagementsAddress =
  process.env.NEXT_PUBLIC_HIREHUB_ENGAGEMENTS_ADDRESS?.trim();

export const HIREHUB_ADDRESS: Address | null =
  configuredAddress && isAddress(configuredAddress)
    ? getAddress(configuredAddress)
    : null;

export const HIREHUB_ENGAGEMENTS_ADDRESS: Address | null =
  configuredEngagementsAddress && isAddress(configuredEngagementsAddress)
    ? getAddress(configuredEngagementsAddress)
    : null;

export const VIA_BASE_URL = "https://via-hadrian.testnet.romeprotocol.xyz";
export const isPreviewMode = HIREHUB_ADDRESS === null;

export function shortAddress(address: string, size = 5) {
  if (address.length <= size * 2 + 3) return address;
  return `${address.slice(0, size + 2)}…${address.slice(-size)}`;
}
