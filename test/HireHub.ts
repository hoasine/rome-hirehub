import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("HireHub", async () => {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [owner, linked, employer, stranger] = await viem.getWalletClients();

  async function deploy() {
    return viem.deployContract("HireHub");
  }

  async function write(
    contract: Awaited<ReturnType<typeof deploy>>,
    wallet: typeof owner,
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

  it("creates and updates a contributor profile", async () => {
    const hub = await deploy();
    await write(hub, owner, "createProfile", [
      "Mina Park",
      "Cross-VM engineer",
      "Builds simple interfaces.",
      "",
    ]);

    assert.equal(await hub.read.profileCount(), 1n);
    assert.equal(await hub.read.profileOfWallet([owner.account.address]), 1n);
    const profile = (await hub.read.getProfile([1n])) as {
      displayName: string;
      owner: string;
      headline: string;
      attestationCount: number;
    };
    assert.equal(profile.displayName, "Mina Park");
    assert.equal(profile.owner.toLowerCase(), owner.account.address.toLowerCase());

    await write(hub, owner, "updateProfile", [
      1n,
      "Mina Park",
      "Rome product engineer",
      "Builds dual-lane products.",
      "",
    ]);
    assert.equal(
      ((await hub.read.getProfile([1n])) as { headline: string }).headline,
      "Rome product engineer",
    );
  });

  it("requires consent from both wallets before linking", async () => {
    const hub = await deploy();
    await write(hub, owner, "createProfile", ["Owner", "Builder", "", ""]);
    await write(hub, owner, "proposeWallet", [1n, linked.account.address]);

    assert.equal(await hub.read.pendingWalletLinks([1n, linked.account.address]), true);
    await write(hub, linked, "acceptWalletLink", [1n]);

    assert.equal(await hub.read.profileOfWallet([linked.account.address]), 1n);
    assert.deepEqual(
      ((await hub.read.getProfileWallets([1n])) as readonly string[]).map((item) =>
        item.toLowerCase(),
      ),
      [owner.account.address.toLowerCase(), linked.account.address.toLowerCase()],
    );

    await assert.rejects(
      () => write(hub, stranger, "acceptWalletLink", [1n]),
      /LinkNotProposed|reverted/,
    );
  });

  it("records work and lets only the named employer attest it", async () => {
    const hub = await deploy();
    await write(hub, owner, "createProfile", ["Builder", "Engineer", "", ""]);
    await write(hub, owner, "submitWork", [
      1n,
      employer.account.address,
      "Dual-wallet onboarding",
      "Shipped a complete wallet flow.",
      "https://github.com/example/work",
    ]);

    const pending = (await hub.read.getWork([1n])) as {
      status: number;
      employer: string;
    };
    assert.equal(pending.status, 0);
    assert.equal(pending.employer.toLowerCase(), employer.account.address.toLowerCase());

    await assert.rejects(
      () => write(hub, stranger, "reviewWork", [1n, true, 5, "Looks good"]),
      /NotEmployer|reverted/,
    );

    await write(hub, employer, "reviewWork", [1n, true, 5, "Excellent delivery"]);
    const approved = (await hub.read.getWork([1n])) as {
      status: number;
      rating: number;
    };
    const profile = (await hub.read.getProfile([1n])) as { attestationCount: number };
    assert.equal(approved.status, 1);
    assert.equal(approved.rating, 5);
    assert.equal(profile.attestationCount, 1);

    await assert.rejects(
      () => write(hub, employer, "reviewWork", [1n, true, 5, "Second review"]),
      /WorkAlreadyReviewed|reverted/,
    );
  });

  it("rejects invalid records and unauthorized profile changes", async () => {
    const hub = await deploy();
    await write(hub, owner, "createProfile", ["Builder", "Engineer", "", ""]);

    await assert.rejects(
      () => write(hub, stranger, "updateProfile", [1n, "No", "Access", "", ""]),
      /NotProfileOwner|reverted/,
    );
    await assert.rejects(
      () => write(hub, owner, "submitWork", [
        1n,
        owner.account.address,
        "Self review",
        "",
        "https://example.com",
      ]),
      /InvalidAddress|reverted/,
    );
    await assert.rejects(
      () => write(hub, owner, "createProfile", ["Again", "Duplicate", "", ""]),
      /AlreadyHasProfile|reverted/,
    );
  });
});
