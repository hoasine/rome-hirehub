"use client";

import { getWallets } from "@wallet-standard/app";
import {
  isSyntheticProvisioned,
  provisionSynthetic,
  submitRomeTx,
  submitRomeTxV1,
  syntheticAddress as deriveSyntheticAddress,
  type LaneSigner,
} from "@rome-protocol/sdk";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAddress, type Address, type Hex } from "viem";
import {
  HIREHUB_ADDRESS,
  ROME_PROGRAM_ID,
  SOLANA_RPC,
  hadrian,
} from "@/lib/config";
import { publicClient } from "@/lib/contract";
import type { TransactionState } from "@/lib/types";

type WalletLane = "evm" | "solana";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
  removeListener?(event: "accountsChanged", listener: (accounts: string[]) => void): void;
}

interface StandardAccount {
  address: string;
}

interface StandardWallet {
  name: string;
  accounts: readonly StandardAccount[];
  features: Record<string, unknown>;
}

interface ConnectFeature {
  connect(): Promise<{ accounts: readonly StandardAccount[] }>;
}

interface SignMessageFeature {
  signMessage(input: {
    account: StandardAccount;
    message: Uint8Array;
  }): Promise<readonly { signature: Uint8Array }[]>;
}

interface SignTransactionFeature {
  supportedTransactionVersions?: readonly (string | number)[];
  signTransaction(input: {
    account: StandardAccount;
    transaction: Uint8Array;
    chain: string;
  }): Promise<readonly { signedTransaction: Uint8Array }[]>;
}

interface WalletContextValue {
  evmAddress: Address | null;
  solanaAddress: string | null;
  syntheticAddress: Address | null;
  activeAddress: Address | null;
  activeLane: WalletLane | null;
  transaction: TransactionState;
  connectEvm(): Promise<void>;
  connectSolana(): Promise<void>;
  selectLane(lane: WalletLane): void;
  disconnect(): void;
  executeCall(data: Hex): Promise<Hex>;
  resetTransaction(): void;
}

const WalletContext = createContext<WalletContextValue | null>(null);
const connection = new Connection(SOLANA_RPC, "confirmed");

function ethereumProvider() {
  return (window as typeof window & { ethereum?: Eip1193Provider }).ethereum;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    if (error.message.includes("User rejected")) return "Signature request was rejected.";
    return error.message;
  }
  return "The transaction could not be completed.";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [evmAddress, setEvmAddress] = useState<Address | null>(null);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [syntheticAddress, setSyntheticAddress] = useState<Address | null>(null);
  const [solanaSigner, setSolanaSigner] = useState<LaneSigner | null>(null);
  const [signLegacyTransaction, setSignLegacyTransaction] = useState<
    ((transaction: Transaction) => Promise<Transaction>) | null
  >(null);
  const [activeLane, setActiveLane] = useState<WalletLane | null>(null);
  const [transaction, setTransaction] = useState<TransactionState>({ status: "idle" });

  useEffect(() => {
    const provider = ethereumProvider();
    if (!provider?.on) return;

    const handleAccountsChanged = (accounts: string[]) => {
      const account = accounts[0];
      setEvmAddress(account ? getAddress(account) : null);
      setTransaction({ status: "idle" });
      if (!account) {
        setActiveLane((lane) => (lane === "evm" ? null : lane));
      }
    };

    provider.on("accountsChanged", handleAccountsChanged);
    return () => provider.removeListener?.("accountsChanged", handleAccountsChanged);
  }, []);

  const connectEvm = useCallback(async () => {
    const provider = ethereumProvider();
    if (!provider) throw new Error("Install MetaMask or another EVM wallet to continue.");

    const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts[0]) throw new Error("No EVM account was returned.");
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${hadrian.id.toString(16)}` }],
      });
    } catch {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${hadrian.id.toString(16)}`,
            chainName: hadrian.name,
            nativeCurrency: hadrian.nativeCurrency,
            rpcUrls: hadrian.rpcUrls.default.http,
            blockExplorerUrls: [hadrian.blockExplorers.default.url],
          },
        ],
      });
    }
    setEvmAddress(getAddress(accounts[0]));
    setActiveLane("evm");
  }, []);

  const connectSolana = useCallback(async () => {
    const wallets = getWallets().get() as readonly StandardWallet[];
    const wallet = wallets.find(
      (candidate) =>
        candidate.name.toLowerCase().includes("solflare") &&
        "standard:connect" in candidate.features &&
        "solana:signMessage" in candidate.features &&
        "solana:signTransaction" in candidate.features,
    );
    if (!wallet) {
      throw new Error(
        "Solflare with Wallet Standard support was not found. Install Solflare and switch it to Devnet.",
      );
    }

    const connect = wallet.features["standard:connect"] as ConnectFeature;
    const result = wallet.accounts.length ? { accounts: wallet.accounts } : await connect.connect();
    const account = result.accounts[0];
    if (!account) throw new Error("Solflare did not return an account.");

    const signMessage = wallet.features["solana:signMessage"] as SignMessageFeature;
    const signTransaction = wallet.features["solana:signTransaction"] as SignTransactionFeature;
    if (!signTransaction.supportedTransactionVersions?.includes(1)) {
      throw new Error("This Solflare version does not advertise Solana v1 transaction support.");
    }
    if (!signTransaction.supportedTransactionVersions.includes("legacy")) {
      throw new Error("This Solflare version cannot activate a new Rome synthetic address.");
    }

    const payer = new PublicKey(account.address);
    const signer: LaneSigner = {
      payer,
      signAuthHash: async (message) => {
        const output = await signMessage.signMessage({ account, message });
        if (!output[0]?.signature) throw new Error("Solflare returned no message signature.");
        return output[0].signature;
      },
      signV1Wire: async (transaction) => {
        const output = await signTransaction.signTransaction({
          account,
          transaction,
          chain: "solana:devnet",
        });
        const signed = output[0]?.signedTransaction;
        if (!signed || signed.length < 64) {
          throw new Error("Solflare returned an invalid signed transaction.");
        }
        return signed.slice(-64);
      },
    };

    setSolanaAddress(account.address);
    setSyntheticAddress(getAddress(deriveSyntheticAddress(payer)));
    setSolanaSigner(signer);
    setSignLegacyTransaction(() => async (transaction: Transaction) => {
      const output = await signTransaction.signTransaction({
        account,
        transaction: transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
        chain: "solana:devnet",
      });
      const signed = output[0]?.signedTransaction;
      if (!signed) throw new Error("Solflare returned no signed activation transaction.");
      return Transaction.from(signed);
    });
    setActiveLane("solana");
  }, []);

  const disconnect = useCallback(() => {
    setEvmAddress(null);
    setSolanaAddress(null);
    setSyntheticAddress(null);
    setSolanaSigner(null);
    setSignLegacyTransaction(null);
    setActiveLane(null);
  }, []);

  const executeCall = useCallback(
    async (data: Hex): Promise<Hex> => {
      if (!HIREHUB_ADDRESS) {
        throw new Error("Preview mode is read-only. Deploy HireHub and configure its address first.");
      }
      try {
        setTransaction({ status: "preparing", message: "Preparing your Rome transaction…" });
        if (activeLane === "evm" && evmAddress) {
          const provider = ethereumProvider();
          setTransaction({ status: "signing", message: "Confirm this action in your EVM wallet." });
          const hash = await submitRomeTx(provider, {
            from: evmAddress,
            to: HIREHUB_ADDRESS,
            data,
          });
          setTransaction({
            status: "confirming",
            message: "Your transaction is settling through Rome on Solana.",
            hash,
          });
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") throw new Error("The contract call reverted.");
          setTransaction({ status: "success", message: "On-chain record confirmed.", hash });
          return hash;
        }

        if (
          activeLane === "solana" &&
          syntheticAddress &&
          solanaSigner &&
          signLegacyTransaction
        ) {
          const provisioned = await isSyntheticProvisioned(
            connection,
            ROME_PROGRAM_ID,
            syntheticAddress,
          );
          if (!provisioned) {
            setTransaction({
              status: "signing",
              message: "Activate your Rome synthetic address in Solflare.",
            });
            await provisionSynthetic({
              connection,
              proxyUrl: hadrian.rpcUrls.default.http[0],
              chainId: hadrian.id,
              programId: ROME_PROGRAM_ID,
              payer: solanaSigner.payer,
              signTransaction: signLegacyTransaction,
            });
          }
          setTransaction({
            status: "signing",
            message: "Solflare will ask for an authorization and transaction signature.",
          });
          const result = await submitRomeTxV1(
            {
              connection,
              proxyUrl: hadrian.rpcUrls.default.http[0],
              chainId: hadrian.id,
              programId: ROME_PROGRAM_ID,
              signer: solanaSigner,
            },
            { to: HIREHUB_ADDRESS, data },
          );
          if (result.receipt?.status !== "0x1") {
            throw new Error("The Rome transaction was not confirmed successfully.");
          }
          setTransaction({
            status: "success",
            message: `Confirmed through the ${result.route} Solana route.`,
            hash: result.hash,
          });
          return result.hash;
        }
        throw new Error("Connect an EVM or Solana wallet first.");
      } catch (error) {
        setTransaction({ status: "error", message: errorMessage(error) });
        throw error;
      }
    },
    [activeLane, evmAddress, signLegacyTransaction, solanaSigner, syntheticAddress],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      evmAddress,
      solanaAddress,
      syntheticAddress,
      activeAddress: activeLane === "evm" ? evmAddress : syntheticAddress,
      activeLane,
      transaction,
      connectEvm,
      connectSolana,
      selectLane: setActiveLane,
      disconnect,
      executeCall,
      resetTransaction: () => setTransaction({ status: "idle" }),
    }),
    [
      activeLane,
      connectEvm,
      connectSolana,
      disconnect,
      evmAddress,
      executeCall,
      solanaAddress,
      syntheticAddress,
      transaction,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useRomeWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useRomeWallet must be used inside WalletProvider");
  return context;
}
