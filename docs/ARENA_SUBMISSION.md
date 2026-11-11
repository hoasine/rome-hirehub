# HIREhub — Arena submission

## One-line description

HIREhub is a bilateral work market where EVM and Solana employers and contributors agree, deliver, pay, and attest in one shared Rome state.

## Problem

On-chain contributors have work, identity, and reputation split across wallet ecosystems. A Solana identity and an EVM identity look unrelated even when one person controls both. Portfolio claims are easy to write and hard for employers to trust, and paying a contributor on the other ecosystem means bridging funds first.

## Solution

HIREhub is two Solidity contracts on Rome:

1. **HireHub** — the identity registry. A contributor creates a profile from MetaMask or Solflare and links further wallets only after both keys sign.
2. **HireHubEngagements** — the work market. An employer profile proposes a milestone, optionally escrowing an ERC-20. The contributor accepts from any linked wallet, submits evidence with a content hash, and the employer approves. Payout and attestation finalize in the same transaction.

Reputation comes from agreements both sides signed before work started, not from self-reported claims.

## Why Rome

The product is only useful if both wallet communities participate as equals. Rome lets a Solana wallet call the same Solidity contracts from its derived synthetic address, without an EVM key. An EVM employer can hire and pay a Solana contributor, or the other way round, against one escrow and one reputation ledger. There is no second deployment, profile mirror, bridge, or sync layer.

## Submission category

EVM and Solana wallets — HIREhub.

## Completed features

- Contributor discovery by name, skill, work history, EVM address, or synthetic address
- Profile creation and editing from either wallet lane
- Consent-based multi-wallet identity, with proposal cancellation
- Connected-wallet dashboard: my profile, pending wallet links, employer review inbox, and agreement activity
- Bilateral engagements: propose, accept or decline, submit hashed evidence, request revision, approve, or reject
- Optional ERC-20 escrow with in-app allowance, balance checks, and decimals-aware amounts
- Escrow exits for every state: cancel, decline, contributor withdrawal, 30-day stale reclaim, and settle-after-dispute
- Self-attestation blocked at the profile level: an employer cannot hire any wallet of its own profile
- Shareable `/profile/[id]` and `/engagement/[id]` pages
- Live Hadrian block height in the header instead of a hard-coded status
- Legacy v1 work records and employer attestations kept readable and reviewable

## Quality

- 17 contract tests covering roles, state transitions, escrow conservation, refunds, stale reclaim, dispute settlement, fee-on-transfer rejection, rating bounds, and pagination
- Frontend unit tests for the URL allowlist, UTF-8 byte limits, payment formatting, and stale detection
- 14 Playwright smoke tests on desktop and mobile, including a mocked MetaMask session
- GitHub Actions runs lint, typecheck, all tests, the production build, browser tests, and a dependency audit
- Content Security Policy and hardened response headers

## Technical notes

- Network: Rome Hadrian, chain ID `200010`
- Contracts: `HireHub.sol` and `HireHubEngagements.sol`, Solidity `0.8.28`
- EVM writes: Rome SDK `submitRomeTx`
- Solana writes: Rome SDK `submitRomeTxV1`, with a legacy-transaction fallback for Solflare builds that do not advertise v1
- Storage: on-chain metadata and evidence hashes; evidence files stay at an HTTPS or IPFS URL

## Submission links

- Live app: `https://rome-hirehub.vercel.app`
- Source repository: `https://github.com/hoasine/rome-hirehub`
- HireHub identity contract: `0x079206514810cf8051b9707dc6ffe7dfec5eb48d`
- HireHubEngagements contract: `0xecd85ce77a64a18b2c9b6cb947fc10ed1715fede`
- Via Explorer (identity): `https://via-hadrian.testnet.romeprotocol.xyz/address/0x079206514810cf8051b9707dc6ffe7dfec5eb48d`
- Via Explorer (engagements): `https://via-hadrian.testnet.romeprotocol.xyz/address/0xecd85ce77a64a18b2c9b6cb947fc10ed1715fede`
- Verified source (identity): `https://verify.testnet.romeprotocol.xyz/repo-ui/200010/0x079206514810cf8051b9707dc6ffe7dfec5eb48d`
- Verified source (engagements): `https://verify.testnet.romeprotocol.xyz/repo-ui/200010/0xecd85ce77a64a18b2c9b6cb947fc10ed1715fede`
- Demo video: `ADD_VIDEO_URL`
- X post: `ADD_X_URL`
