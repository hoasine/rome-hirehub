# Security

HIREhub runs on Rome Hadrian testnet. Do not use mainnet keys or real funds.

## Reporting

Open a private security advisory on the GitHub repository, or contact the maintainer through the Rome Discord. Please do not file public issues for vulnerabilities.

## Contract trust model

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#trust-boundaries). In short:

- Neither contract has an owner, an admin key, or an upgrade path.
- `HireHubEngagements` holds escrow only between creation and a terminal state, and every terminal state either pays the contributor or refunds the employer.
- Disputes have no arbiter, and reputation does not resist two colluding profiles.

## Frontend hardening

- A Content Security Policy blocks framing, plugins, and foreign script origins. Inline scripts stay allowed because statically prerendered pages cannot carry per-request nonces.
- User-supplied links must be HTTPS or well-formed IPFS URIs, and avatars load without a referrer.
- Text is checked against the contracts' UTF-8 byte limits before signing.

## Known dependency advisories

`npm audit --omit=dev` reports high and moderate advisories in transitive dependencies of `@solana/web3.js` (`jayson`, `stream-json`, `uuid`) and in `zod`. No compatible fix exists upstream yet. HIREhub uses these packages only in the browser, to talk to trusted Solana and Hadrian RPC endpoints, and never parses untrusted JSON-RPC input with them on a server. CI fails on any critical advisory, and these will be upgraded once compatible releases ship.
