# HIREhub demo script

Target length: 2–3 minutes.

## Preparation

1. Open the deployed HIREhub app.
2. Prepare MetaMask on Hadrian and Solflare on Devnet.
3. Give each wallet a small amount of test gas.
4. Open the deployed contract in Via Explorer in a second tab.

## Recording

### 1. Explain the product

“HIREhub gives EVM and Solana contributors one verifiable work history. It uses one Solidity contract and one shared state on Rome.”

Show the contributor directory, address search, profile cards, and work counts.

### 2. Create a profile from MetaMask

Connect MetaMask, choose “Create your profile,” complete the short form, and sign. Show the transaction status and open its Via link.

### 3. Prove multi-wallet identity

Open the new profile and choose “Link wallet.” Connect Solflare once to reveal its Rome synthetic address, switch back to MetaMask, and propose that synthetic address.

Activate Solflare, choose “Accept wallet link,” enter the profile ID, and sign the readable Rome authorization plus the v1 transaction. Reopen the profile and show both verified wallets.

### 4. Submit work and attest it

From either linked wallet, add a work record with the employer’s EVM address and a GitHub/demo URL.

Switch to the employer account. Open the work record, approve it, assign five stars, and publish a short review.

### 5. Close with Rome

Show the updated attestation count and Via Explorer.

“The Solana wallet never created an EVM key, and no profile data was mirrored. Both wallets used the same contract, state, and work history through Rome.”
