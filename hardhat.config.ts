import hardhatNodeTestRunner from "@nomicfoundation/hardhat-node-test-runner";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import hardhatViem from "@nomicfoundation/hardhat-viem";
import { defineConfig } from "hardhat/config";

const deploymentAccounts = [
  process.env.PRIVATE_KEY,
  process.env.EMPLOYER_PRIVATE_KEY,
].filter((account): account is string => Boolean(account));

export default defineConfig({
  plugins: [hardhatViem, hardhatNodeTestRunner, hardhatVerify],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  networks: {
    hadrian: {
      type: "http",
      chainType: "l1",
      chainId: 200010,
      url: "https://hadrian.testnet.romeprotocol.xyz/",
      accounts: deploymentAccounts,
    },
  },
  verify: {
    etherscan: { enabled: false },
    blockscout: { enabled: false },
    sourcify: {
      enabled: true,
      apiUrl: "https://verify.testnet.romeprotocol.xyz",
    },
  },
});
