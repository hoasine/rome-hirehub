import hardhat from "hardhat";
import { getAddress, isAddress } from "viem";

async function main() {
  const rawAddress = process.env.HIREHUB_ADDRESS;
  if (!rawAddress || !isAddress(rawAddress)) {
    throw new Error("Set HIREHUB_ADDRESS to the deployed Hadrian contract.");
  }

  const { viem } = await hardhat.network.create();
  const publicClient = await viem.getPublicClient();
  const [contributor, employer] = await viem.getWalletClients();
  if (!contributor || !employer) {
    throw new Error(
      "Seed needs PRIVATE_KEY and EMPLOYER_PRIVATE_KEY, each funded with Hadrian test USDC.",
    );
  }

  const address = getAddress(rawAddress);
  const contributorHub = await viem.getContractAt("HireHub", address, {
    client: { public: publicClient, wallet: contributor },
  });
  const employerHub = await viem.getContractAt("HireHub", address, {
    client: { public: publicClient, wallet: employer },
  });

  let profileId = await contributorHub.read.profileOfWallet([contributor.account.address]);
  if (profileId === 0n) {
    const hash = await contributorHub.write.createProfile([
      "Rome Builder",
      "Cross-VM product engineer",
      "Building useful applications for EVM and Solana users on one shared state.",
      "",
    ]);
    await publicClient.waitForTransactionReceipt({ hash });
    profileId = await contributorHub.read.profileOfWallet([contributor.account.address]);
    console.log(`Created profile ${profileId}`);
  }

  const hash = await contributorHub.write.submitWork([
    profileId,
    employer.account.address,
    "HIREhub Arena MVP",
    "Built a dual-wallet contributor directory with consent-based identity and attestations.",
    "https://github.com/",
  ]);
  await publicClient.waitForTransactionReceipt({ hash });
  const workId = await contributorHub.read.workCount();

  const reviewHash = await employerHub.write.reviewWork([
    workId,
    true,
    5,
    "Complete MVP with clear dual-wallet flows and verifiable records.",
  ]);
  await publicClient.waitForTransactionReceipt({ hash: reviewHash });
  console.log(`Seeded and attested work record ${workId}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
