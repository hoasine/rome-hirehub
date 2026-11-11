import { mkdir, writeFile } from "node:fs/promises";
import hardhat from "hardhat";
import { formatEther, getAddress, isAddress, type Address } from "viem";

const LIVE_HIREHUB_ADDRESS = "0x079206514810cf8051b9707dc6ffe7dfec5eb48d";

async function main() {
  const { viem } = await hardhat.network.create();
  const client = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  if (!deployer) throw new Error("No deployment account. Set PRIVATE_KEY first.");

  const balance = await client.getBalance({ address: deployer.account.address });
  console.log(`Deployer: ${deployer.account.address} (${formatEther(balance)} gas)`);
  if (balance === 0n) throw new Error("The deployer has no Hadrian gas balance.");

  const deployNewIdentity = process.env.DEPLOY_NEW_IDENTITY === "1";
  const configuredIdentity =
    process.env.HIREHUB_ADDRESS ??
    process.env.NEXT_PUBLIC_HIREHUB_ADDRESS ??
    (deployNewIdentity ? undefined : LIVE_HIREHUB_ADDRESS);
  let identityAddress: Address;

  if (configuredIdentity) {
    if (!isAddress(configuredIdentity)) {
      throw new Error("HIREHUB_ADDRESS is not a valid EVM address.");
    }
    identityAddress = getAddress(configuredIdentity);
    const existingCode = await client.getCode({ address: identityAddress });
    if (!existingCode) {
      throw new Error(`No HireHub bytecode found at ${identityAddress}.`);
    }
    console.log(`Using existing HireHub: ${identityAddress}`);
  } else {
    const hireHub = await viem.deployContract("HireHub");
    identityAddress = hireHub.address;
    console.log(`HireHub deployed: ${identityAddress}`);
    console.log(`NEXT_PUBLIC_HIREHUB_ADDRESS=${identityAddress}`);
  }

  const engagements = await viem.deployContract("HireHubEngagements", [
    identityAddress,
  ]);
  const code = await client.getCode({ address: engagements.address });
  if (!code) throw new Error("Engagement deployment completed without bytecode");
  const anchoredIdentity = (await engagements.read.identity()) as Address;
  if (getAddress(anchoredIdentity) !== identityAddress) {
    throw new Error("Engagement contract is anchored to the wrong identity registry.");
  }

  console.log(`HireHubEngagements deployed: ${engagements.address}`);
  console.log(
    `Explorer: https://via-hadrian.testnet.romeprotocol.xyz/address/${engagements.address}`,
  );
  console.log(`NEXT_PUBLIC_HIREHUB_ENGAGEMENTS_ADDRESS=${engagements.address}`);

  await mkdir("deployments", { recursive: true });
  await writeFile(
    "deployments/hadrian.json",
    `${JSON.stringify(
      {
        chainId: 200010,
        hireHub: identityAddress,
        hireHubEngagements: engagements.address,
        deployer: deployer.account.address,
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
