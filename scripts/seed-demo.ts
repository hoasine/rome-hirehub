import { existsSync, readFileSync, writeFileSync } from "node:fs";
import hardhat from "hardhat";
import {
  createWalletClient,
  custom,
  formatEther,
  keccak256,
  maxUint256,
  parseEther,
  parseEventLogs,
  parseUnits,
  toBytes,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { hireHubAbi } from "../lib/abi";
import { hadrian } from "../lib/config";
import { engagementAbi, erc20Abi } from "../lib/engagement-abi";

const HADRIAN_HIREHUB = "0x079206514810cf8051b9707dc6ffe7dfec5eb48d" as const;
const HADRIAN_ENGAGEMENTS = "0xecd85ce77a64a18b2c9b6cb947fc10ed1715fede" as const;
// Must match DEMO_BIO_PREFIX in components/hirehub-app.tsx.
const DEMO = "Demo account ·";
const OWNER_PROFILE_ID = 1n;
const STATE_FILE = ".demo-seed.json";
// Hadrian charges for Solana compute, so even small calls reserve several million gas.
const GAS_BUFFER = parseEther("0.2");
const REPO = "https://github.com/hoasine/rome-hirehub";

const engagementCreatedAbi = [
  {
    type: "event",
    name: "EngagementCreated",
    inputs: [
      { name: "engagementId", type: "uint256", indexed: true },
      { name: "employerProfileId", type: "uint256", indexed: true },
      { name: "contributorProfileId", type: "uint256", indexed: true },
      { name: "employer", type: "address", indexed: false },
      { name: "paymentToken", type: "address", indexed: false },
      { name: "paymentAmount", type: "uint256", indexed: false },
    ],
  },
] as const;

type PersonaKey = "aurora" | "solstice" | "lan" | "diego" | "aiko" | "priya";

const personas: Record<PersonaKey, [string, string, string]> = {
  aurora: ["Aurora Labs", "DeFi product studio hiring cross-VM builders", "Ships lending and payments products for EVM and Solana users."],
  solstice: ["Solstice DAO", "Community DAO funding Rome tooling", "Funds open-source tooling, docs, and community programs on Rome."],
  lan: ["Lan Tran", "Frontend engineer · wallet UX", "React and TypeScript engineer focused on wallet onboarding."],
  diego: ["Diego Alvarez", "Solidity developer · audits and tests", "Writes Solidity with invariant tests and readable reviews."],
  aiko: ["Aiko Sato", "Product designer · data dashboards", "Designs dashboards that make on-chain activity easy to read."],
  priya: ["Priya Menon", "Technical writer · developer docs", "Writes quickstarts and guides for Solidity and Solana developers."],
};

type Step =
  | ["create", string, string, number]
  | ["accept"]
  | ["decline"]
  | ["evidence", string]
  | ["revision", string]
  | ["approve", number, string];

interface Scenario {
  key: string;
  employer: PersonaKey;
  contributor: PersonaKey | "owner";
  steps: Step[];
}

const scenarios: Scenario[] = [
  {
    key: "wallet-onboarding",
    employer: "aurora",
    contributor: "lan",
    steps: [
      ["create", "Dual-wallet onboarding flow", "Guide MetaMask and Solflare users from connect to first transaction. Acceptance: mobile layout, error states, and a recorded walkthrough.", 250],
      ["accept"],
      ["evidence", `${REPO}/blob/master/components/wallet-provider.tsx`],
      ["approve", 5, "Clear states for every wallet edge case. Shipped a day early."],
    ],
  },
  {
    key: "escrow-tests",
    employer: "aurora",
    contributor: "diego",
    steps: [
      ["create", "Escrow invariant test suite", "Cover payout, refund, and dispute paths with explicit balance assertions.", 0],
      ["accept"],
      ["evidence", `${REPO}/blob/master/test/HireHubEngagements.ts`],
      ["approve", 4, "Thorough coverage. A fuzzing pass would make it complete."],
    ],
  },
  {
    key: "activity-dashboard",
    employer: "solstice",
    contributor: "aiko",
    steps: [
      ["create", "Grant activity dashboard", "Show funded, delivered, and paid milestones per contributor.", 400],
      ["accept"],
      ["evidence", `${REPO}/blob/master/docs/ARCHITECTURE.md`],
      ["revision", "Please add the mobile layout and an empty state before sign-off."],
      ["evidence", `${REPO}/blob/master/app/globals.css`],
      ["approve", 5, "Revision handled quickly. Exactly what the DAO needed."],
    ],
  },
  {
    key: "quickstart-docs",
    employer: "solstice",
    contributor: "priya",
    steps: [
      ["create", "Rome quickstart guide", "Write a ten-minute quickstart for deploying a Solidity contract to Hadrian.", 150],
      ["accept"],
      ["evidence", `${REPO}/blob/master/README.md`],
    ],
  },
  {
    key: "lending-ui",
    employer: "aurora",
    contributor: "aiko",
    steps: [
      ["create", "Lending position UI", "Design the borrow and repay screens for a cross-VM lending market.", 0],
      ["accept"],
    ],
  },
  {
    key: "bridge-copy",
    employer: "solstice",
    contributor: "lan",
    steps: [["create", "Bridge status copywriting", "Rewrite bridge status messages so users always know the next step.", 120]],
  },
  {
    key: "declined-audit",
    employer: "aurora",
    contributor: "priya",
    steps: [
      ["create", "Contract audit report", "Review the payment router and publish findings.", 80],
      ["decline"],
    ],
  },
  {
    key: "owner-demo",
    employer: "solstice",
    contributor: "owner",
    steps: [["create", "Record the HIREhub v2 demo", "Record a two-minute walkthrough of an EVM employer hiring a Solana contributor.", 0]],
  },
];

interface SeedState {
  keys: Partial<Record<PersonaKey, Hex>>;
  token?: Address;
  approvedToken: PersonaKey[];
  scenarios: Record<string, { id?: string; done: number }>;
}

async function main() {
  const connection = await hardhat.network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const [funder] = await viem.getWalletClients();
  if (!funder) throw new Error("Set PRIVATE_KEY to the funded deployer wallet.");

  const isHadrian = (await publicClient.getChainId()) === hadrian.id;
  let HIREHUB: Address = HADRIAN_HIREHUB;
  let ENGAGEMENTS: Address = HADRIAN_ENGAGEMENTS;
  let state: SeedState = { keys: {}, approvedToken: [], scenarios: {} };
  if (isHadrian && existsSync(STATE_FILE)) state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  const saveState = (next: SeedState) => {
    if (isHadrian) writeFileSync(STATE_FILE, `${JSON.stringify(next, null, 2)}\n`);
  };

  if (!isHadrian) {
    console.log("Local dry run: deploying throwaway contracts.");
    const hub = await viem.deployContract("HireHub");
    await publicClient.waitForTransactionReceipt({
      hash: await hub.write.createProfile(["Owner", "Profile owner", "", ""]),
    });
    HIREHUB = hub.address;
    ENGAGEMENTS = (await viem.deployContract("HireHubEngagements", [hub.address])).address;
  }

  const wallets = {} as Record<PersonaKey, ReturnType<typeof createWalletClient> & { address: Address }>;
  for (const key of Object.keys(personas) as PersonaKey[]) {
    state.keys[key] ??= generatePrivateKey();
    const account = privateKeyToAccount(state.keys[key]!);
    wallets[key] = Object.assign(
      createWalletClient({ account, chain: publicClient.chain, transport: custom(connection.provider) }),
      { address: account.address },
    );
  }
  saveState(state);

  async function send(
    wallet: (typeof wallets)[PersonaKey],
    to: Address,
    abi: readonly unknown[],
    functionName: string,
    args: readonly unknown[],
  ) {
    const gas = await publicClient.estimateContractGas({
      address: to,
      abi,
      functionName,
      args,
      account: wallet.account!,
    } as never);
    const gasPrice = await publicClient.getGasPrice();
    await topUp(wallet.address, (gas * gasPrice * 12n) / 10n);
    const before = await publicClient.getBalance({ address: wallet.address });
    const hash = await wallet.writeContract({
      address: to,
      abi,
      functionName,
      args,
      gas,
      account: wallet.account!,
      chain: publicClient.chain,
    } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
    spent += before - (await publicClient.getBalance({ address: wallet.address }));
    return receipt;
  }

  let spent = 0n;
  async function topUp(address: Address, needed: bigint) {
    const balance = await publicClient.getBalance({ address });
    if (balance >= needed) return;
    const value = needed - balance + GAS_BUFFER;
    const funderBalance = await publicClient.getBalance({ address: funder!.account.address });
    if (funderBalance < value + GAS_BUFFER * 4n) {
      throw new Error(
        `The funder wallet has ${formatEther(funderBalance)} USDC left. ` +
          "Bridge more test USDC to it, then run `npm run seed:demo` again to resume.",
      );
    }
    const hash = await funder!.sendTransaction({ to: address, value });
    await publicClient.waitForTransactionReceipt({ hash });
  }

  console.log(`Funder ${funder.account.address}: ${formatEther(await publicClient.getBalance({ address: funder.account.address }))} gas`);

  const profileIds = {} as Record<PersonaKey, bigint>;
  for (const key of Object.keys(personas) as PersonaKey[]) {
    let id = await publicClient.readContract({
      address: HIREHUB,
      abi: hireHubAbi,
      functionName: "profileOfWallet",
      args: [wallets[key].address],
    });
    if (id === 0n) {
      const [name, headline, bio] = personas[key];
      await send(wallets[key], HIREHUB, hireHubAbi, "createProfile", [name, headline, `${DEMO} ${bio}`, ""]);
      id = await publicClient.readContract({
        address: HIREHUB,
        abi: hireHubAbi,
        functionName: "profileOfWallet",
        args: [wallets[key].address],
      });
      console.log(`Created profile #${id} for ${name}`);
    }
    profileIds[key] = id;
  }

  if (!state.token) {
    const token = await viem.deployContract("MockToken");
    state.token = token.address;
    saveState(state);
    console.log(`Deployed demo token hUSD: ${token.address}`);
  }
  const token = state.token;
  const decimals = 6;

  for (const scenario of scenarios) {
    const progress = (state.scenarios[scenario.key] ??= { done: 0 });
    const employer = wallets[scenario.employer];
    const contributor = scenario.contributor === "owner" ? null : wallets[scenario.contributor];

    for (let index = progress.done; index < scenario.steps.length; index++) {
      const step = scenario.steps[index];
      const id = progress.id ? BigInt(progress.id) : 0n;
      if (step[0] === "create") {
        const [, title, description, amount] = step;
        const payment = parseUnits(String(amount), decimals);
        if (payment > 0n) {
          const balance = await publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [employer.address],
          });
          if (balance < payment) {
            await send(employer, token, [
              { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
            ], "mint", [employer.address, parseUnits("10000", decimals)]);
          }
          if (!state.approvedToken.includes(scenario.employer)) {
            await send(employer, token, erc20Abi, "approve", [ENGAGEMENTS, maxUint256]);
            state.approvedToken.push(scenario.employer);
            saveState(state);
          }
        }
        const contributorProfile =
          scenario.contributor === "owner" ? OWNER_PROFILE_ID : profileIds[scenario.contributor];
        const receipt = await send(employer, ENGAGEMENTS, engagementAbi, "createEngagement", [
          contributorProfile,
          title,
          description,
          payment > 0n ? token : zeroAddress,
          payment,
        ]);
        const [created] = parseEventLogs({ abi: engagementCreatedAbi, logs: receipt.logs });
        if (!created) throw new Error("EngagementCreated event missing");
        progress.id = created.args.engagementId.toString();
        console.log(`Agreement #${progress.id}: ${title}`);
      } else {
        if (!contributor && step[0] !== "approve" && step[0] !== "revision") break;
        if (step[0] === "accept") await send(contributor!, ENGAGEMENTS, engagementAbi, "acceptEngagement", [id]);
        if (step[0] === "decline") await send(contributor!, ENGAGEMENTS, engagementAbi, "declineEngagement", [id]);
        if (step[0] === "evidence") {
          await send(contributor!, ENGAGEMENTS, engagementAbi, "submitEvidence", [id, step[1], keccak256(toBytes(step[1]))]);
        }
        if (step[0] === "revision") await send(employer, ENGAGEMENTS, engagementAbi, "requestRevision", [id, step[1]]);
        if (step[0] === "approve") await send(employer, ENGAGEMENTS, engagementAbi, "approveEngagement", [id, step[1], step[2]]);
        console.log(`  #${progress.id} ${step[0]}`);
      }
      progress.done = index + 1;
      saveState(state);
    }
  }

  // Re-running the seed reviews anything the profile owner has delivered to a demo employer.
  const ownerDemo = state.scenarios["owner-demo"];
  if (ownerDemo?.id) {
    const record = await publicClient.readContract({
      address: ENGAGEMENTS,
      abi: engagementAbi,
      functionName: "getEngagement",
      args: [BigInt(ownerDemo.id)],
    });
    if (record.status === 2) {
      await send(wallets.solstice, ENGAGEMENTS, engagementAbi, "approveEngagement", [
        BigInt(ownerDemo.id),
        5,
        "Great walkthrough. The cross-VM hiring story is easy to follow.",
      ]);
      console.log(`Approved your delivered agreement #${ownerDemo.id}`);
    }
  }

  console.log("\nDemo profiles:");
  for (const key of Object.keys(personas) as PersonaKey[]) {
    console.log(`  #${profileIds[key]} ${personas[key][0]}  ${wallets[key].address}`);
  }
  console.log(`Demo wallets spent ${formatEther(spent)} gas on this run.`);
  console.log(`Funder balance: ${formatEther(await publicClient.getBalance({ address: funder.account.address }))} gas`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
