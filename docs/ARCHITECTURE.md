# Architecture

## Two contracts, one state

The identity registry deployed in v1 stays at its original address. A companion contract, `HireHubEngagements`, reads it for profile membership, so existing profiles and linked wallets carry straight into the work market.

```text
MetaMask -> submitRomeTx -> Rome proxy -----+
                                            +-> HireHub.sol ............ profiles, wallet links, v1 work
Solflare -> submitRomeTxV1 -> Rome program -+        ^
                                            |        | profileOfWallet()
                                            +-> HireHubEngagements.sol . agreements, escrow, attestations
```

The Solana lane derives `msg.sender` as `keccak256(solana_pubkey)[12:]`. That synthetic address is a normal contract caller, while the user keeps authorizing with the Solana key.

## Identity safety

HIREhub never assumes two addresses belong to the same person.

1. A profile owner proposes a target address, and can cancel the proposal.
2. The target address calls `acceptWalletLink` itself.
3. The contract adds the address only if it belongs to no other profile.

## Engagement lifecycle

```text
Proposed --accept--> Accepted --submit--> Submitted --approve--> Completed (pay + attest)
   |  \                 |   ^                 |  \
cancel decline     withdraw |              revise reject
   v     v              v   +--RevisionRequested  v
Cancelled Rejected  Cancelled                  Rejected (refund)

Accepted / Submitted / RevisionRequested --dispute--> Disputed
Disputed --approve (evidence exists)--> Completed
Disputed --contributor withdraws------> Cancelled (refund)
Accepted / RevisionRequested idle 30 days --employer reclaims--> Cancelled (refund)
```

Rules enforced on-chain:

- Callers act through their profile. Any linked wallet may act for its profile, and payouts go to the wallet that accepted or last submitted.
- The employer and contributor must be different profiles, so a person cannot attest their own work through a second linked wallet.
- Escrow is pulled at creation, and the received balance must equal the stated amount, so fee-on-transfer tokens are rejected.
- Every non-completed terminal state refunds the employer. Completion pays the contributor. State changes happen before token transfers, behind a reentrancy guard.
- Profile pages are bounded to 50 IDs per read.

## Trust boundaries

- Anyone can create a profile, so two profiles controlled by one person can still attest each other. Reputation should be read alongside the employer's own history, which every profile page exposes.
- Disputes have no arbiter. Either side can still exit: the employer can settle by paying, or the contributor can withdraw and refund. If both refuse, funds stay locked until one of them acts.
- Evidence URLs are external. The stored hash proves which URI was submitted, not what the URI serves later.

## Data boundaries

Names, biographies, scopes, reviews, and URLs are bounded on-chain strings, measured in UTF-8 bytes. The frontend checks those byte limits before signing. There is no API server or private database.

## Solana constraints

Calls touch only Rome EVM state and stay well below atomic v1 transaction limits. Escrow uses Hadrian ERC-20 tokens, so no SPL wrapper grants, CPI depth, or account discovery is needed.
