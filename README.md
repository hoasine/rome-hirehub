# HIREhub

HIREhub is an on-chain contributor directory and employer-attestation network built for the Rome Arena. One Solidity deployment on Hadrian serves MetaMask users and Solana wallet users. Solana users call the same contract from their Rome synthetic address and never need an EVM key.

## What the MVP proves

- A contributor can create a public profile from either wallet lane.
- A profile owner proposes a second wallet, and that wallet must independently accept the link.
- Any linked wallet can submit a completed-work record to a named employer.
- Only that employer can approve or reject the record and publish a rating.
- Profiles, links, work, and attestations share one contract and one state.

The MVP deliberately does not move funds. That keeps the submission focused on identity and attestations and means the Solana lane does not need wUSDC fund/sweep or wrapper-grant steps.

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
npm run check
```

## Deploy the contract to Hadrian

Hadrian uses test USDC as gas. Fund a dedicated EVM wallet with at least 1 USDC through the Rome Bridge before deploying. Never commit a private key.

```powershell
$env:PRIVATE_KEY="0x..."
npm run deploy:hadrian
```

The script prints the contract address and Via Explorer URL. Put the address in `.env.local`:

```bash
NEXT_PUBLIC_HIREHUB_ADDRESS=0x...
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
```

Restart the frontend. It will now read and write canonical Hadrian state.

Publish reproducible source and ABI to Rome's Sourcify verifier:

```bash
npx hardhat verify --network hadrian 0xYOUR_CONTRACT
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

For the Solana lane, use Solflare on Devnet. HIREhub checks that the wallet advertises Solana v1 transaction support before asking it to sign. The wallet signs a readable Rome authorization and then the composed Solana transaction.

## Contract model

`HireHub.sol` maintains:

- `profileOfWallet`: one profile membership per wallet/synthetic address.
- `pendingWalletLinks`: owner proposal plus target-wallet acceptance.
- `WorkRecord`: evidence, named employer, review status, rating, and timestamps.
- Profile wallet and work indexes for frontend discovery.

String lengths are bounded, every privileged transition checks `msg.sender`, and a work record can be reviewed exactly once.

## Production frontend

Deploy the Next.js app to Vercel or another Node-compatible host and configure:

```bash
NEXT_PUBLIC_HIREHUB_ADDRESS=0x...
NEXT_PUBLIC_SOLANA_RPC=https://api.devnet.solana.com
```

See [`docs/ARENA_SUBMISSION.md`](docs/ARENA_SUBMISSION.md) for submission copy and [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md) for the recording flow.
