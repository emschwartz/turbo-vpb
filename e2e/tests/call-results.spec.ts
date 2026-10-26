import {
  test,
  expect,
  chromium,
  Browser,
  BrowserContext,
  Page,
} from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

// These tests check that each call result tapped on the phone is recorded
// on the right contact, exactly once.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/chrome-mv3-dev",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

const FIRST_CONTACT = "Alice Johnson";
const SECOND_CONTACT = "Bob Smith";

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
  let serviceWorker = extensionContext.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await extensionContext.waitForEvent("serviceworker");
  }
  await serviceWorker.evaluate(
    (serverUrl) => (globalThis as any).chrome.storage.local.set({ serverUrl }),
    SERVER_URL,
  );
});

test.afterAll(async () => {
  await extensionContext?.close();
});

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

async function connectPhone(
  connectUrl: string,
): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(connectUrl);
  await expect(page.locator("#status")).toHaveText("Connected", {
    timeout: 15_000,
  });
  return { browser, page };
}

async function tapCallResult(phone: Page, result: string) {
  await phone.locator("#call-result-links button", { hasText: result }).click();
}

test("phone shows the next household member who has the same phone number", async () => {
  const phonebankPage = await openPhonebank("household");
  const phone = await connectPhone(await getConnectUrl(phonebankPage));
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    await tapCallResult(phone.page, "Left Voicemail");
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      SECOND_CONTACT,
    );

    // Bob has Alice's phone number, but he is a different person, so the
    // phone must show his name (and use it in text messages) right away
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT, {
      timeout: 5_000,
    });
    await expect(phone.page.locator("#loading")).toBeHidden();
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});
