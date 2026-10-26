import { test, expect, chromium, BrowserContext, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

// These tests cover when the QR code modal opens. They use their own
// extension context so storage.session starts empty (never paired), which
// the shared context in e2e.spec.ts can't guarantee.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/chrome-mv3-dev",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let extensionContext: BrowserContext;
let phonebankPage: Page;
let connectUrl: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  extensionContext = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-gpu",
      "--no-default-browser-check",
    ],
  });

  let serviceWorker = extensionContext.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await extensionContext.waitForEvent("serviceworker");
  }
  await serviceWorker.evaluate(
    (serverUrl) => (globalThis as any).chrome.storage.local.set({ serverUrl }),
    SERVER_URL,
  );

  phonebankPage = await extensionContext.newPage();
  await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
});

test.afterAll(async () => {
  await extensionContext?.close();
});

function qrModal(page: Page) {
  return page.locator('#turbovpb-insert [role="dialog"]');
}

// The dialog wrapper itself has no box (its children are position: fixed),
// so check visibility on the modal's content
function qrModalContent(page: Page) {
  return qrModal(page).locator("h2");
}

function sidebarInsert(page: Page) {
  return page.locator("#turbovpb-insert");
}

async function getConnectUrl(page: Page): Promise<string> {
  const link = page.locator('#turbovpb-insert a[href*="/connect"]').first();
  await expect(link).toBeAttached({ timeout: 15_000 });
  const href = await link.getAttribute("href");
  if (!href) {
    throw new Error("Connect URL link has no href");
  }
  return href;
}

/**
 * Open the connect page in a separate browser, simulating the phone, and
 * wait until it is receiving contacts.
 */
async function connectPhone(url: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  await expect(page.locator("#status")).toHaveText("Connected", {
    timeout: 15_000,
  });
  return browser;
}

/**
 * The modal opens asynchronously (after storage loads, or after a server
 * notification), so a single "not visible" check could pass before it
 * appears. Keep checking for a while instead.
 */
async function expectModalToStayHidden(page: Page, durationMs = 3_000) {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    await expect(qrModal(page)).toHaveCount(0);
    await page.waitForTimeout(250);
  }
}

test("modal is shown on first load before the phone has paired", async () => {
  await expect(qrModalContent(phonebankPage)).toBeVisible({ timeout: 15_000 });
  await expect(qrModal(phonebankPage)).toContainText("Scan QR code to connect");
  connectUrl = await getConnectUrl(phonebankPage);
});

test("modal closes when the phone connects", async () => {
  const phone = await connectPhone(connectUrl);
  try {
    await expect(qrModal(phonebankPage)).toHaveCount(0, { timeout: 15_000 });
    await expect(sidebarInsert(phonebankPage)).toContainText("Connected");
  } finally {
    await phone.close();
  }
});

test("modal does not reopen when the phone disconnects and reconnects for each call", async () => {
  // The previous test closed the phone. Each iteration simulates a call:
  // the phone browser drops its connection while in the dialer, then
  // reconnects when the volunteer switches back to it.
  for (let call = 0; call < 3; call++) {
    // Wait until the extension has processed the disconnect, so the
    // following check isn't vacuous
    await expect(sidebarInsert(phonebankPage)).toContainText(
      "Waiting for phone to reconnect",
      { timeout: 15_000 },
    );
    await expectModalToStayHidden(phonebankPage);

    // The sidebar insert keeps the QR code out of the way, but still offers
    // it for re-pairing
    const qrCodeLink = sidebarInsert(phonebankPage).locator(
      'a[href*="/connect"]',
    );
    await expect(qrCodeLink).toBeHidden();
    await sidebarInsert(phonebankPage).getByText("Show QR code").click();
    await expect(qrCodeLink).toBeVisible();
    expect(await qrCodeLink.getAttribute("href")).toBe(connectUrl);

    const phone = await connectPhone(connectUrl);
    await expect(sidebarInsert(phonebankPage)).toContainText("Connected", {
      timeout: 15_000,
    });
    await expect(qrModal(phonebankPage)).toHaveCount(0);
    await phone.close();
  }
});

test("modal does not reopen after a page reload while paired", async () => {
  // e.g. VAN loading the next contact while the phone is still in the dialer
  await phonebankPage.reload();
  await expect(sidebarInsert(phonebankPage)).toContainText(
    "Waiting for phone to reconnect",
    { timeout: 15_000 },
  );
  await expectModalToStayHidden(phonebankPage);

  // Same channel, so the phone can reconnect without re-scanning
  expect(await getConnectUrl(phonebankPage)).toBe(connectUrl);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(sidebarInsert(phonebankPage)).toContainText("Connected", {
      timeout: 15_000,
    });
    await expect(qrModal(phonebankPage)).toHaveCount(0);
  } finally {
    await phone.close();
  }
});

test("modal can still be opened from the popup while paired", async () => {
  await expect(qrModal(phonebankPage)).toHaveCount(0);

  const serviceWorker = extensionContext.serviceWorkers()[0];
  await serviceWorker.evaluate(async (url) => {
    const chrome = (globalThis as any).chrome;
    const [tab] = await chrome.tabs.query({ url });
    await chrome.tabs.sendMessage(tab.id, { type: "openQrCodeModal" });
  }, `${SERVER_URL}/test-phonebank*`);

  await expect(qrModalContent(phonebankPage)).toBeVisible({ timeout: 5_000 });
});
