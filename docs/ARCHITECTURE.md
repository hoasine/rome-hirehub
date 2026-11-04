# Architecture

## Shared contract

HIREhub keeps its core in Solidity because the application is primarily identity and authorization logic. Rome executes that contract inside Solana, so MetaMask and Solflare users reach the same address and storage.

```text
MetaMask -> submitRomeTx -> Rome proxy -----+
                                            +-> HireHub.sol -> shared records
Solflare -> submitRomeTxV1 -> Rome program -+
```

The Solana lane derives `msg.sender` as `keccak256(solana_pubkey)[12:]`. That synthetic address is a normal contract caller, but the user continues to authorize actions with the Solana key.

## Identity safety

HIREhub never assumes that two addresses belong to the same person.

1. A profile owner proposes a target address.
2. The target address calls `acceptWalletLink` itself.
3. The contract adds it only if it has no other profile.

This two-transaction flow gives both keys explicit control and prevents arbitrary address attachment.

## Attestation safety

A linked contributor wallet creates a work record and names one employer address. Only that address may review it, ratings must be 1–5 for approvals and zero for rejections, and the status can transition only once from pending.

## Data boundaries

Names, short biographies, review text, and URLs are bounded on-chain strings. Large evidence stays on GitHub, a live deployment, or IPFS. There is no API server or private database in the MVP.

## Solana constraints

Calls touch only Rome EVM state and remain comfortably below the atomic v1 transaction limits. The app does not move SPL tokens or call nested Solana programs, so it avoids wrapper grants, CPI depth, and account-discovery risk.
