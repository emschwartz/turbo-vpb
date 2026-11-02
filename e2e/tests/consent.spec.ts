import { test, expect, chromium, BrowserContext } from "@playwright/test";
import { launchExtensionContext } from "./helpers/launch";

// The extension must not send anything to a server until the user has agreed
// to the data disclosure. This uses its own context because it needs storage
// without `dataConsent`, which every other test presets.

const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let extensionContext: BrowserContext;

test.afterAll(async () => {
  await extensionContext?.close();
});

test("nothing is sent before the user agrees, and contacts flow after", async () => {
  test.setTimeout(120_000);
  extensionContext = await launchExtensionContext();
  let serviceWorker = extensionContext.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await extensionContext.waitForEvent("serviceworker");
  }
  // A custom server URL is set, so this also covers that case
  await serviceWorker.evaluate(
    (serverUrl) => (globalThis as any).chrome.storage.local.set({ serverUrl }),
    SERVER_URL,
  );

  const page = await extensionContext.newPage();
  const apiTraffic: string[] = [];
  page.on("websocket", (ws) => {
    if (ws.url().includes("/api/")) apiTraffic.push(`ws ${ws.url()}`);
  });
  page.on("request", (req) => {
    if (req.url().includes("/api/")) apiTraffic.push(`http ${req.url()}`);
  });
  await page.goto(`${SERVER_URL}/test-phonebank`);

  const modal = page.locator('#turbovpb-insert [role="dialog"]');
  await expect(modal.locator("h2")).toBeVisible({ timeout: 60_000 });
  await expect(modal).toContainText("Private and secure by design");
  await expect(modal).toContainText(
    "TurboVPB sends the name, phone number, and other details of each contact on your phone bank page to your phone.",
  );
  await expect(modal).toContainText("End-to-end encrypted:");
  await expect(modal).toContainText("We never see contact details:");
  await expect(modal).toContainText("No accounts or ads");
  const link = modal.getByRole("link", { name: "Privacy policy" });
  await expect(link).toHaveAttribute("href", "https://turbovpb.com/privacy");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(
    page.locator('#turbovpb-insert a[href*="/connect"]'),
  ).toHaveCount(0);

  // Give a (wrongly) eager connection time to show up
  await page.waitForTimeout(5_000);
  expect(apiTraffic).toEqual([]);

  await modal.getByRole("button", { name: "Agree and connect" }).click();

  const qrLink = page.locator('#turbovpb-insert a[href*="/connect"]').first();
  await expect(qrLink).toBeAttached({ timeout: 15_000 });
  const connectUrl = (await qrLink.getAttribute("href"))!;
  expect(apiTraffic.length).toBeGreaterThan(0);

  const phone = await chromium.launch();
  try {
    const phonePage = await phone.newPage();
    await phonePage.goto(connectUrl);
    await expect(phonePage.locator("#name")).toHaveText("Alice Johnson", {
      timeout: 15_000,
    });
  } finally {
    await phone.close();
  }

  const stored = await serviceWorker.evaluate(() =>
    (globalThis as any).chrome.storage.local.get("dataConsent"),
  );
  expect(stored.dataConsent).toBe(true);
});
