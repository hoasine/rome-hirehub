import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";
import { keccak256, toBytes } from "viem";

describe("HireHubEngagements", async () => {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [employer, contributor, linkedContributor, stranger] =
    await viem.getWalletClients();

  async function write(
    contract: Awaited<ReturnType<typeof viem.deployContract>>,
    wallet: typeof employer,
    functionName: string,
    args: readonly unknown[] = [],
  ) {
    const hash = await wallet.writeContract({
      address: contract.address,
      abi: contract.abi,
      functionName,
      args,
    } as never);
    return publicClient.waitForTransactionReceipt({ hash });
  }

  async function deployFixture() {
    const identity = await viem.deployContract("HireHub");
    await write(identity, employer, "createProfile", [
      "Rome Studio",
      "Cross-chain employer",
      "",
      "",
    ]);
    await write(identity, contributor, "createProfile", [
      "Mina",
      "Rome builder",
      "",
      "",
    ]);
    await write(identity, contributor, "proposeWallet", [
      2n,
      linkedContributor.account.address,
    ]);
    await write(identity, linkedContributor, "acceptWalletLink", [2n]);

    const engagements = await viem.deployContract("HireHubEngagements", [
      identity.address,
    ]);
    return { identity, engagements };
  }

  it("requires an employer profile and prevents same-profile engagements", async () => {
    const { engagements } = await deployFixture();

    await assert.rejects(
      () =>
        write(engagements, stranger, "createEngagement", [
          2n,
          "Untrusted proposal",
          "",
          "0x0000000000000000000000000000000000000000",
          0n,
        ]),
      /InvalidProfile|reverted/,
    );
    await assert.rejects(
      () =>
        write(engagements, contributor, "createEngagement", [
          2n,
          "Self attestation",
          "",
          "0x0000000000000000000000000000000000000000",
          0n,
        ]),
      /SameProfile|reverted/,
    );
  });

  it("completes a bilateral reputation-only engagement", async () => {
    const { engagements } = await deployFixture();
    const evidenceHash = keccak256(toBytes("ipfs://hirehub-proof"));

    await write(engagements, employer, "createEngagement", [
      2n,
      "Dual-wallet onboarding",
      "Ship an EVM and Solana onboarding flow.",
      "0x0000000000000000000000000000000000000000",
      0n,
    ]);
    await assert.rejects(
      () => write(engagements, stranger, "acceptEngagement", [1n]),
      /InvalidProfile|NotContributor|reverted/,
    );
    await write(engagements, linkedContributor, "acceptEngagement", [1n]);
    await write(engagements, linkedContributor, "submitEvidence", [
      1n,
      "ipfs://hirehub-proof",
      evidenceHash,
    ]);
    await write(engagements, employer, "approveEngagement", [
      1n,
      5,
      "Excellent cross-VM delivery.",
    ]);

    const engagement = (await engagements.read.getEngagement([1n])) as {
      contributor: string;
      evidenceHash: string;
      rating: number;
      status: number;
    };
    assert.equal(
      engagement.contributor.toLowerCase(),
      linkedContributor.account.address.toLowerCase(),
    );
    assert.equal(engagement.evidenceHash, evidenceHash);
    assert.equal(engagement.rating, 5);
    assert.equal(engagement.status, 4);
    assert.equal(await engagements.read.profileCompletedCount([2n]), 1n);
  });

  it("escrows an ERC-20 and pays the accepting contributor", async () => {
    const { engagements } = await deployFixture();
    const token = await viem.deployContract("MockToken");
    const amount = 2_500_000n;

    await write(token, employer, "mint", [employer.account.address, amount]);
    await write(token, employer, "approve", [engagements.address, amount]);
    await write(engagements, employer, "createEngagement", [
      2n,
      "Paid milestone",
      "Deliver production UI.",
      token.address,
      amount,
    ]);
    assert.equal(await token.read.balanceOf([engagements.address]), amount);

    await write(engagements, contributor, "acceptEngagement", [1n]);
    await write(engagements, contributor, "submitEvidence", [
      1n,
      "https://github.com/example/proof",
      keccak256(toBytes("proof")),
    ]);
    await write(engagements, employer, "approveEngagement", [1n, 4, "Shipped"]);

    assert.equal(await token.read.balanceOf([contributor.account.address]), amount);
    assert.equal(await token.read.balanceOf([engagements.address]), 0n);
  });

  it("refunds escrow when either side declines an unaccepted proposal", async () => {
    const { engagements } = await deployFixture();
    const token = await viem.deployContract("MockToken");
    const amount = 1_000_000n;
    await write(token, employer, "mint", [employer.account.address, amount * 2n]);
    await write(token, employer, "approve", [engagements.address, amount * 2n]);

    await write(engagements, employer, "createEngagement", [
      2n,
      "Proposal one",
      "",
      token.address,
      amount,
    ]);
    await write(engagements, contributor, "declineEngagement", [1n]);
    assert.equal(await token.read.balanceOf([employer.account.address]), amount * 2n);

    await write(engagements, employer, "createEngagement", [
      2n,
      "Proposal two",
      "",
      token.address,
      amount,
    ]);
    await write(engagements, employer, "cancelProposal", [2n]);
    assert.equal(await token.read.balanceOf([employer.account.address]), amount * 2n);
  });

  it("supports revision and final rejection while preserving state rules", async () => {
    const { engagements } = await deployFixture();
    await write(engagements, employer, "createEngagement", [
      2n,
      "Review cycle",
      "",
      "0x0000000000000000000000000000000000000000",
      0n,
    ]);
    await write(engagements, contributor, "acceptEngagement", [1n]);
    await write(engagements, contributor, "submitEvidence", [
      1n,
      "https://example.com/v1",
      keccak256(toBytes("v1")),
    ]);
    await write(engagements, employer, "requestRevision", [1n, "Add tests"]);
    await write(engagements, linkedContributor, "submitEvidence", [
      1n,
      "https://example.com/v2",
      keccak256(toBytes("v2")),
    ]);
    await write(engagements, employer, "rejectEngagement", [
      1n,
      "Acceptance criteria were not met.",
    ]);

    const engagement = (await engagements.read.getEngagement([1n])) as {
      status: number;
      review: string;
    };
    assert.equal(engagement.status, 5);
    assert.equal(engagement.review, "Acceptance criteria were not met.");
    await assert.rejects(
      () => write(engagements, employer, "approveEngagement", [1n, 5, "Late"]),
      /InvalidState|reverted/,
    );
  });

  it("locks disputed engagements and returns bounded profile pages", async () => {
    const { engagements } = await deployFixture();
    await write(engagements, employer, "createEngagement", [
      2n,
      "Disputed milestone",
      "",
      "0x0000000000000000000000000000000000000000",
      0n,
    ]);
    await write(engagements, contributor, "acceptEngagement", [1n]);
    await write(engagements, contributor, "raiseDispute", [1n]);

    assert.deepEqual(
      await engagements.read.getProfileEngagementIds([2n, false, 0n, 10n]),
      [1n],
    );
    assert.equal(
      await engagements.read.getProfileEngagementCount([1n, true]),
      1n,
    );
    await assert.rejects(
      () =>
        engagements.read.getProfileEngagementIds([2n, false, 0n, 51n]),
      /LimitTooLarge|reverted/,
    );
    await assert.rejects(
      () =>
        write(engagements, contributor, "submitEvidence", [
          1n,
          "https://example.com",
          keccak256(toBytes("blocked")),
        ]),
      /InvalidState|reverted/,
    );
  });

  async function fundedFixture(amount: bigint) {
    const fixture = await deployFixture();
    const token = await viem.deployContract("MockToken");
    await write(token, employer, "mint", [employer.account.address, amount]);
    await write(token, employer, "approve", [fixture.engagements.address, amount]);
    await write(fixture.engagements, employer, "createEngagement", [
      2n,
      "Escrowed milestone",
      "",
      token.address,
      amount,
    ]);
    await write(fixture.engagements, contributor, "acceptEngagement", [1n]);
    return { ...fixture, token };
  }

  it("settles a dispute for the contributor only once evidence exists", async () => {
    const amount = 750_000n;
    const { engagements, token } = await fundedFixture(amount);

    await write(engagements, employer, "raiseDispute", [1n]);
    await assert.rejects(
      () => write(engagements, employer, "approveEngagement", [1n, 5, "No proof"]),
      /InvalidState|reverted/,
    );
    await write(engagements, contributor, "withdrawEngagement", [1n]);
    assert.equal(await token.read.balanceOf([employer.account.address]), amount);

    await write(token, employer, "approve", [engagements.address, amount]);
    await write(engagements, employer, "createEngagement", [
      2n,
      "Second milestone",
      "",
      token.address,
      amount,
    ]);
    await write(engagements, contributor, "acceptEngagement", [2n]);
    await write(engagements, contributor, "submitEvidence", [
      2n,
      "ipfs://delivery",
      keccak256(toBytes("delivery")),
    ]);
    await write(engagements, contributor, "raiseDispute", [2n]);
    await write(engagements, employer, "approveEngagement", [2n, 4, "Resolved"]);
    assert.equal(await token.read.balanceOf([contributor.account.address]), amount);
    assert.equal(await token.read.balanceOf([engagements.address]), 0n);
    assert.equal(await engagements.read.profileCompletedCount([2n]), 1n);
  });

  it("lets only the contributor withdraw and refunds the employer", async () => {
    const amount = 300_000n;
    const { engagements, token } = await fundedFixture(amount);

    await assert.rejects(
      () => write(engagements, employer, "withdrawEngagement", [1n]),
      /NotContributor|reverted/,
    );
    await write(engagements, linkedContributor, "withdrawEngagement", [1n]);
    const record = (await engagements.read.getEngagement([1n])) as { status: number };
    assert.equal(record.status, 6);
    assert.equal(await token.read.balanceOf([employer.account.address]), amount);
    await assert.rejects(
      () => write(engagements, linkedContributor, "withdrawEngagement", [1n]),
      /InvalidState|reverted/,
    );
  });

  it("allows employers to reclaim escrow only after the stale window", async () => {
    const amount = 900_000n;
    const { engagements, token } = await fundedFixture(amount);
    const testClient = await viem.getTestClient();

    await assert.rejects(
      () => write(engagements, employer, "reclaimStaleEngagement", [1n]),
      /InvalidState|reverted/,
    );
    await testClient.increaseTime({ seconds: 30 * 24 * 60 * 60 });
    await testClient.mine({ blocks: 1 });
    await assert.rejects(
      () => write(engagements, contributor, "reclaimStaleEngagement", [1n]),
      /NotEmployer|reverted/,
    );
    await write(engagements, employer, "reclaimStaleEngagement", [1n]);
    assert.equal(await token.read.balanceOf([employer.account.address]), amount);
    assert.equal(await token.read.balanceOf([engagements.address]), 0n);
  });

  it("rejects fee-on-transfer tokens and malformed payment terms", async () => {
    const { engagements } = await deployFixture();
    const token = await viem.deployContract("MockToken");
    await write(token, employer, "setFeeBps", [100n]);
    await write(token, employer, "mint", [employer.account.address, 1_000_000n]);
    await write(token, employer, "approve", [engagements.address, 1_000_000n]);

    await assert.rejects(
      () =>
        write(engagements, employer, "createEngagement", [
          2n,
          "Fee token",
          "",
          token.address,
          1_000_000n,
        ]),
      /TokenTransferFailed|reverted/,
    );
    await assert.rejects(
      () =>
        write(engagements, employer, "createEngagement", [
          2n,
          "Amount without token",
          "",
          "0x0000000000000000000000000000000000000000",
          1n,
        ]),
      /InvalidAmount|reverted/,
    );
    await assert.rejects(
      () =>
        write(engagements, employer, "createEngagement", [
          2n,
          "Token without code",
          "",
          stranger.account.address,
          1n,
        ]),
      /InvalidAddress|reverted/,
    );
    await assert.rejects(
      () =>
        write(engagements, employer, "createEngagement", [
          2n,
          "x".repeat(101),
          "",
          "0x0000000000000000000000000000000000000000",
          0n,
        ]),
      /TextTooLong|reverted/,
    );
  });

  it("enforces ratings, evidence, and role checks across the lifecycle", async () => {
    const { engagements } = await deployFixture();
    await write(engagements, employer, "createEngagement", [
      2n,
      "Role checks",
      "",
      "0x0000000000000000000000000000000000000000",
      0n,
    ]);
    await assert.rejects(
      () => write(engagements, contributor, "submitEvidence", [1n, "ipfs://early", keccak256(toBytes("early"))]),
      /InvalidState|reverted/,
    );
    await write(engagements, contributor, "acceptEngagement", [1n]);
    await assert.rejects(
      () =>
        write(engagements, contributor, "submitEvidence", [
          1n,
          "ipfs://proof",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        ]),
      /EmptyValue|reverted/,
    );
    await write(engagements, contributor, "submitEvidence", [
      1n,
      "ipfs://proof",
      keccak256(toBytes("proof")),
    ]);
    await assert.rejects(
      () => write(engagements, contributor, "approveEngagement", [1n, 5, "Self"]),
      /NotEmployer|reverted/,
    );
    await assert.rejects(
      () => write(engagements, employer, "approveEngagement", [1n, 0, "Zero"]),
      /InvalidRating|reverted/,
    );
    await assert.rejects(
      () => write(engagements, employer, "approveEngagement", [1n, 6, "Six"]),
      /InvalidRating|reverted/,
    );
    await assert.rejects(
      () => engagements.read.getEngagement([99n]),
      /EngagementNotFound|reverted/,
    );
  });
});
