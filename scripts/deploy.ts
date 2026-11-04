import hardhat from "hardhat";

async function main() {
  const { viem } = await hardhat.network.create();
  const client = await viem.getPublicClient();
  const hireHub = await viem.deployContract("HireHub");

  console.log(`HireHub deployed: ${hireHub.address}`);
  console.log(`Explorer: https://via-hadrian.testnet.romeprotocol.xyz/address/${hireHub.address}`);
  console.log(`NEXT_PUBLIC_HIREHUB_ADDRESS=${hireHub.address}`);

  const code = await client.getCode({ address: hireHub.address });
  if (!code) throw new Error("Deployment completed without contract bytecode");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
