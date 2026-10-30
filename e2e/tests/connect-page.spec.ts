import { test, expect, chromium, BrowserContext, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

// These tests cover what the connect page (the phone) tells the volunteer
// and the extension, beyond relaying contacts and call results.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/chrome-mv3-dev",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

const FIRST_CONTACT = "Alice Johnson";
const SECOND_CONTACT = "Bob Smith";

const TEXTED_TEMPLATE = {
  label: "Quick Text",
  message: "Hi [their name], just reaching out!",
  sendTextedResult: true,
};

let extensionContext: BrowserContext;

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
  await setExtensionSettings({ serverUrl: SERVER_URL });
});

test.afterAll(async () => {
  await extensionContext?.close();
});

async function setExtensionSettings(settings: Record<string, unknown>) {
  let serviceWorker = extensionContext.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await extensionContext.waitForEvent("serviceworker");
  }
  await serviceWorker.evaluate(
    (settings) => (globalThis as any).chrome.storage.local.set(settings),
    settings,
  );
}

async function openPhonebank(query: string): Promise<Page> {
  const page = await extensionContext.newPage();
  await page.goto(`${SERVER_URL}/test-phonebank?${query}`);
  return page;
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

async function connectPhone(connectUrl: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(connectUrl);
  await expect(page.locator("#status")).toHaveText("Connected", {
    timeout: 15_000,
  });
  return { browser, page };
}

// The volunteer switches to the messaging app and back
async function hideAndShowPhone(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    if (!w.__visibilityOverridden) {
      w.__visibilityOverridden = true;
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => w.__visibilityState,
      });
    }
    for (const state of ["hidden", "visible"]) {
      w.__visibilityState = state;
      document.dispatchEvent(new Event("visibilitychange"));
    }
  });
}

test("the settings link on the phone opens the extension's settings once", async () => {
  const phonebankPage = await openPhonebank("navigate");
  const phone = await connectPhone(await getConnectUrl(phonebankPage));
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    const settingsLink = phone.page.locator("#open-options-page");
    await expect(settingsLink).toBeVisible();

    const optionsPage = extensionContext.waitForEvent("page");
    await settingsLink.click();
    // The new tab's URL is set after the page event fires. Chrome shows
    // the options page embedded in chrome://extensions/?options=<id>.
    await (await optionsPage).waitForURL(/options/);
    await (await optionsPage).close();

    // The server replays the phone's last message to the extension when it
    // reconnects, e.g. after VAN loads the next contact. That must not open
    // the settings again.
    let reopened = false;
    extensionContext.once("page", () => {
      reopened = true;
    });
    await phonebankPage.reload();
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      FIRST_CONTACT,
    );
    await phonebankPage.waitForTimeout(2_000);
    expect(reopened).toBe(false);
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});
