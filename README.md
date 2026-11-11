# HIREhub

HIREhub is a bilateral work market built for the Rome Arena. EVM and Solana employers and contributors agree on a milestone, deliver hashed evidence, release optional ERC-20 escrow, and earn attestations, all in one shared Rome state. Solana users call the same contracts from their Rome synthetic address and never need an EVM key.

![CI](https://github.com/hoasine/rome-hirehub/actions/workflows/check.yml/badge.svg)

## Live deployment

- App: https://rome-hirehub.vercel.app
- HireHub identity contract: `0x079206514810cf8051b9707dc6ffe7dfec5eb48d`
- Explorer: https://via-hadrian.testnet.romeprotocol.xyz/address/0x079206514810cf8051b9707dc6ffe7dfec5eb48d
- Verified source: https://verify.testnet.romeprotocol.xyz/repo-ui/200010/0x079206514810cf8051b9707dc6ffe7dfec5eb48d
- HireHubEngagements contract: see [`deployments/hadrian.json`](deployments/hadrian.json) after deployment

## What it proves

- A contributor creates a public profile from either wallet lane and links more wallets only with both keys' consent.
- An employer profile proposes a milestone to a different profile, optionally escrowing an ERC-20.
- The contributor accepts and submits evidence from any linked wallet; the employer approves, requests a revision, or rejects.
- Approval pays the contributor and records the attestation in one transaction. Every other outcome refunds the employer.
- An EVM employer can hire and pay a Solana contributor, or the reverse, with no bridge or mirrored state.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the state machine and trust boundaries, and [`SECURITY.md`](SECURITY.md) for the security model.

## Stack

- Next.js 16, React 19, TypeScript, and Tailwind CSS
- Solidity 0.8.28 and Hardhat 3
- viem for contract encoding and reads
- `@rome-protocol/sdk` for canonical EVM writes and Solana v1 lane writes
- Wallet Standard for Solflare message and v1 transaction signatures

## Local development

Node.js 22.13 or newer is required.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. With no contract address configured, HIREhub starts in a clearly labelled read-only preview using sample records.

Run all checks:

```bash
npm run check          # lint, typecheck, contract + unit tests, production build
npx playwright install chromium
npm run test:e2e       # builds the preview and runs desktop + mobile smoke tests
```

## Deploy the engagement contract to Hadrian

Hadrian uses test USDC as gas. Fund a dedicated test wallet through the Rome Bridge first. Never commit a private key.

```bash
npm run deploy:secure
```

The command asks for the key with hidden input, deploys `HireHubEngagements` anchored to the live HireHub registry, checks the anchor, writes `deployments/hadrian.json`, and verifies the source on Rome's Sourcify. Set `DEPLOY_NEW_IDENTITY=1` only if you want a fresh identity registry as well.

Add the printed address to `.env.local` and to the hosting environment:

```bash
NEXT_PUBLIC_HIREHUB_ADDRESS=0x079206514810cf8051b9707dc6ffe7dfec5eb48d
NEXT_PUBLIC_HIREHUB_ENGAGEMENTS_ADDRESS=0x...
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
```

To create a small attested demo record, fund a second Hadrian account and run:

```powershell
$env:PRIVATE_KEY="0x..."
$env:EMPLOYER_PRIVATE_KEY="0x..."
$env:HIREHUB_ADDRESS="0x..."
npm run seed:hadrian
```

Use throwaway testnet keys only and clear the shell variables after deployment.

## Wallet requirements

MetaMask is added to Hadrian automatically:

- RPC: `https://hadrian.testnet.romeprotocol.xyz/`
- Chain ID: `200010`
- Gas symbol: `USDC`
- Explorer: `https://via-hadrian.testnet.romeprotocol.xyz/`

For the Solana lane, use Solflare on Devnet. HIREhub uses Rome's v1 transaction route when Solflare advertises v1 support, and falls back to the legacy Solana route otherwise. A new synthetic address is activated with one extra signature on first use.

## Contract model

`HireHub.sol` (identity registry, unchanged since v1) maintains:

- `profileOfWallet`: one profile membership per wallet/synthetic address.
- `pendingWalletLinks`: owner proposal plus target-wallet acceptance.
- `WorkRecord`: legacy evidence records addressed to an employer address.

`HireHubEngagements.sol` maintains:

- `Engagement`: employer and contributor profiles, optional ERC-20 escrow, scope, evidence URI and hash, review, rating, and status.
- Per-profile employer and contributor indexes with bounded pagination.
- `profileCompletedCount`: completed, employer-approved agreements per profile.

Neither contract has an owner or upgrade path. String lengths are bounded in UTF-8 bytes, and every transition checks the caller's profile.

## Production frontend

Deploy the Next.js app to Vercel or another Node-compatible host and configure:

```bash
NEXT_PUBLIC_HIREHUB_ADDRESS=0x079206514810cf8051b9707dc6ffe7dfec5eb48d
NEXT_PUBLIC_HIREHUB_ENGAGEMENTS_ADDRESS=0x...
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
```

See [`docs/ARENA_SUBMISSION.md`](docs/ARENA_SUBMISSION.md) for submission copy and [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the recording flow.
