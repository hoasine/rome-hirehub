# HIREhub demo script

Target length: 2–3 minutes.

## Preparation

1. Open the deployed HIREhub app.
2. Prepare two identities: an employer on MetaMask (Hadrian) and a contributor on Solflare (Devnet). Each needs a HIREhub profile and a little test gas.
3. Optional: hold a Hadrian ERC-20 in the employer wallet to show escrow.
4. Open both contracts in Via Explorer in a second tab.

## Recording

### 1. Explain the product (20 s)

"HIREhub is a work market where EVM and Solana wallets hire, deliver, pay, and attest in one shared Rome state."

Show the live block height, the contributor directory, and a search for a skill.

### 2. Employer proposes work from MetaMask (30 s)

Connect MetaMask and open the Solflare contributor's profile. Choose "Propose engagement", enter a milestone title and acceptance criteria, and optionally a token and amount. If escrow is set, sign the allowance first, then the agreement.

### 3. Contributor accepts and delivers from Solflare (40 s)

Switch to Solflare. The dashboard lists the agreement. Accept it, then choose "Submit evidence" and paste a GitHub or IPFS link. Point out that Solflare signs a readable Rome authorization and never creates an EVM key.

### 4. Employer approves and pays (30 s)

Switch back to MetaMask and choose "Review delivery". Approve with five stars and a short review. Show the agreement marked Completed, the "Paid" escrow line, and the contributor's completed count.

### 5. Close with proof (20 s)

Open `/engagement/<id>` to show the public record, then the Via Explorer transaction.

"An EVM employer just hired and paid a Solana contributor against one escrow and one reputation ledger. No bridge, no mirror, no second deployment. That only works on Rome."
