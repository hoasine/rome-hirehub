import { expect, test, type Page } from "@playwright/test";

const mockEvmAccount = "0x1111111111111111111111111111111111111111";

async function installMockMetaMask(page: Page) {
  await page.addInitScript((account) => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    Object.defineProperty(window, "ethereum", {
      value: {
        isMetaMask: true,
        async request({ method }: { method: string }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
          if (method === "eth_chainId") return "0x30d4a";
          if (method === "wallet_switchEthereumChain") return null;
          throw new Error(`Unsupported mock method ${method}`);
        },
        on(event: string, listener: (...args: unknown[]) => void) {
          (listeners[event] ??= []).push(listener);
        },
        removeListener(event: string, listener: (...args: unknown[]) => void) {
          listeners[event] = (listeners[event] ?? []).filter((item) => item !== listener);
        },
      },
    });
  }, mockEvmAccount);
}

test("home explains the product and renders contributors", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("One reputation.");
  await expect(page.getByText("Mina Park")).toBeVisible();
  await expect(page.getByTestId("network-health")).toBeVisible();
});

test("search covers profiles and their work", async ({ page }) => {
  await page.goto("/");
  const search = page.getByLabel("Search contributors");
  await search.fill("Linh");
  await expect(page.getByText("Linh Nguyen")).toBeVisible();
  await expect(page.getByText("Mina Park")).toHaveCount(0);
  await search.fill("no-such-contributor-xyz");
  await expect(page.getByText("No contributor matches that search yet.")).toBeVisible();
});

test("profile drawer opens, deep links, and closes with Escape", async ({ page }) => {
  await page.goto("/profile/1");
  const drawer = page.getByRole("dialog", { name: /Mina Park profile/ });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});

test("invalid profile routes render the not-found page", async ({ page }) => {
  await page.goto("/profile/abc");
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await expect(page.getByText("Mina Park")).toHaveCount(0);
});

test("missing wallets produce an actionable message", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Connect MetaMask" }).click();
  await expect(page.getByRole("alert").first()).toContainText(/Install MetaMask/);
});

test("a connected EVM wallet loads the dashboard and preview stays read-only", async ({ page }) => {
  await installMockMetaMask(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Connect MetaMask" }).click();
  await expect(
    page.getByRole("button", { name: `Use MetaMask address ${mockEvmAccount}` }),
  ).toBeVisible();
  await expect(page.getByText("Your HIREhub dashboard.")).toBeVisible();
  await expect(page.getByText("No profile yet")).toBeVisible();

  await page.getByRole("button", { name: "Create profile", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[name="displayName"]').fill("E2E Builder");
  await dialog.locator('input[name="headline"]').fill("Testing the judge flow");
  await dialog.locator('button[type="submit"], button.button-primary').last().click();
  await expect(dialog.getByRole("alert")).toContainText(/read-only|Preview/i);
});

test("responses carry security headers", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});
