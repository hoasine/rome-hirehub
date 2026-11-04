# HIREhub — Arena submission

## One-line description

HIREhub is a contributor directory where EVM and Solana wallets build one portable work history from employer-signed attestations.

## Problem

On-chain contributors often have work, identity, and reputation split across wallet ecosystems. A Solana identity and an EVM identity look unrelated even when the same person controls both, while portfolio claims are difficult for an employer to verify.

## Solution

HIREhub deploys one Solidity contract on Rome. A contributor creates a profile from MetaMask or Solflare, links another wallet only after both sides consent, submits evidence of delivered work, and asks the named employer to sign an approval or rejection. Both wallet lanes read and update the same profile state.

## Why Rome

This product is useful only if both wallet communities are equal participants. Rome lets a Solana wallet call the same Solidity contract from a derived synthetic address without creating an EVM key. There is no second deployment, profile mirror, bridge, or synchronization layer.

## Submission category

EVM and Solana wallets — HIREhub.

## Completed features

- Contributor discovery by name, skill, EVM address, or synthetic address
- Profile creation from either wallet lane
- Consent-based multi-wallet identity
- Work evidence addressed to a specific employer
- Employer-only approve/reject attestation with rating
- Shared activity and reputation counts
- Hadrian transaction progress and Via Explorer links
- Responsive preview mode for evaluation before wallet connection

## Technical notes

- Network: Rome Hadrian, chain ID `200010`
- Contract: `HireHub.sol`, Solidity `0.8.28`
- EVM writes: Rome SDK `submitRomeTx`
- Solana writes: Rome SDK `submitRomeTxV1`
- Solana wallet: Wallet Standard with v1 support
- Storage: on-chain records; evidence stays at an external URL such as GitHub or IPFS

## Submission links

- Live app: `https://rome-hirehub.vercel.app`
- Source repository: `https://github.com/hoasine/rome-hirehub`
- Hadrian contract: `0x079206514810cf8051b9707dc6ffe7dfec5eb48d`
- Via Explorer: `https://via-hadrian.testnet.romeprotocol.xyz/address/0x079206514810cf8051b9707dc6ffe7dfec5eb48d`
- Verified source: `https://verify.testnet.romeprotocol.xyz/repo-ui/200010/0x079206514810cf8051b9707dc6ffe7dfec5eb48d`
- Demo video: `ADD_VIDEO_URL`
