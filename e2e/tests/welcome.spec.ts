import { test, expect, BrowserContext, Page } from "@playwright/test";
import { launchExtensionContext } from "./helpers/launch";

// A fresh install opens the welcome page (Chrome only), where agreeing
// stores the same consent the content script reads.

const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let extensionContext: BrowserContext;

test.afterAll(async () => {
  await extensionContext?.close();
});

function findWelcomePage(context: BrowserContext): Page | undefined {
  return context.pages().find((p) => p.url().endsWith("/welcome.html"));
}

test("install opens the welcome page, and agreeing there stores consent", async () => {
  test.setTimeout(120_000);
  extensionContext = await launchExtensionContext();
  let serviceWorker = extensionContext.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await extensionContext.waitForEvent("serviceworker");
  }

  await expect.poll(() => !!findWelcomePage(extensionContext)).toBe(true);
  const welcome = findWelcomePage(extensionContext)!;

  await expect(welcome.locator("body")).toContainText(
    "TurboVPB sends the name, phone number, and other details of each contact on your phone bank page to your phone.",
  );
  await expect(
    welcome.getByRole("link", { name: "Privacy policy" }),
  ).toHaveAttribute("href", "https://turbovpb.com/privacy");
  const before = await serviceWorker.evaluate(() =>
    (globalThis as any).chrome.storage.local.get("dataConsent"),
  );
  expect(before.dataConsent).toBeUndefined();

  await welcome.getByRole("button", { name: "Agree and connect" }).click();

  await expect(welcome.locator("body")).toContainText(
    "Ready to go. Open your phone bank page to get started.",
  );
  await expect(
    welcome.getByRole("button", { name: "Agree and connect" }),
  ).toHaveCount(0);
  const after = await serviceWorker.evaluate(() =>
    (globalThis as any).chrome.storage.local.get("dataConsent"),
  );
  expect(after.dataConsent).toBe(true);

  // An open phone bank page picks the consent up without a reload
  await serviceWorker.evaluate(
    (serverUrl) => (globalThis as any).chrome.storage.local.set({ serverUrl }),
    SERVER_URL,
  );
  const page = await extensionContext.newPage();
  await page.goto(`${SERVER_URL}/test-phonebank`);
  await expect(
    page.locator('#turbovpb-insert a[href*="/connect"]').first(),
  ).toBeAttached({ timeout: 60_000 });
});
