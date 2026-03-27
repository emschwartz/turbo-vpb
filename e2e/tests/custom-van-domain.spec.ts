import { test, expect, chromium, BrowserContext, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/chrome-mv3",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// Same contacts as in test-van-custom-domain.html
const FIRST_CONTACT = {
  firstName: "Alice",
  lastName: "Johnson",
  phone: "(555)-123-4567",
};
const SECOND_CONTACT = {
  firstName: "Bob",
  lastName: "Smith",
  phone: "(555)-987-6543",
};

const MESSAGE_TEMPLATES = [
  {
    label: "Intro",
    message: "Hi [their name], this is [your name] from the campaign.",
    sendTextedResult: false,
  },
];

let extensionContext: BrowserContext;
let serviceWorker: Awaited<ReturnType<BrowserContext["waitForEvent"]>>;

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

  serviceWorker = extensionContext.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await extensionContext.waitForEvent("serviceworker");
  }

  // Set extension settings
  await serviceWorker.evaluate(
    ({ serverUrl, yourName, messageTemplates }) => {
      return (globalThis as any).chrome.storage.local.set({
        serverUrl,
        yourName,
        messageTemplates,
      });
    },
    {
      serverUrl: SERVER_URL,
      yourName: "Test Volunteer",
      messageTemplates: MESSAGE_TEMPLATES,
    },
  );
});

test.afterAll(async () => {
  await extensionContext?.close();
});

async function getConnectUrl(page: Page): Promise<string> {
  const details = await page.evaluate(async () => {
    for (let i = 0; i < 30; i++) {
      // Try browser.storage.session via the chrome extension API
      if (typeof chrome !== "undefined" && chrome.storage?.session) {
        try {
          const result = await chrome.storage.session.get("turboVpbConnection");
          if (result.turboVpbConnection?.channelId && result.turboVpbConnection?.encryptionKey) {
            return result.turboVpbConnection;
          }
        } catch (_) {
          // API may not be available in this context
        }
      }

      // Fall back to DOM sessionStorage
      const stored = sessionStorage.getItem("turboVpbConnection");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.channelId && parsed.encryptionKey) {
          return parsed;
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  });

  if (!details) {
    throw new Error("Extension did not store connection details");
  }

  return `${SERVER_URL}/connect#${details.channelId}&${details.encryptionKey}`;
}

async function openConnectPage(connectUrl: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(connectUrl);
  return { browser, page };
}

test("content script is not auto-injected on non-configured VAN domain", async () => {
  // Navigate to the VAN-style page via 127.0.0.1 (not in the extension's
  // pre-configured domains or host_permissions)
  const page = await extensionContext.newPage();
  await page.goto(`http://127.0.0.1:${SERVER_PORT}/test-van-custom-domain`);

  // Verify the page has the VAN markers that isVanWithCustomDomain() checks for
  const hasVanMarkers = await page.evaluate(
    () =>
      document.querySelector(".van-header") !== null ||
      document.querySelector(".van-inner") !== null,
  );
  expect(hasVanMarkers).toBe(true);

  // Wait and verify the content script is NOT auto-injected
  // (the domain is not in host_permissions or content script match patterns)
  await page.waitForTimeout(3000);
  const hasContentScript = await page.evaluate(
    () => !!document.getElementById("turbovpb-insert"),
  );
  expect(hasContentScript).toBe(false);

  await page.close();
});

test("content script works on VAN-style page after permission grant and injection", async () => {
  // Navigate to the VAN page via localhost (where we have host_permissions).
  // The path /test-van-custom-domain does NOT match any content script match
  // patterns, so the content script won't auto-inject. This simulates the
  // state after a user has granted permission for a custom VAN domain:
  // the extension has host permission but the URL didn't match at install time.
  const vanPage = await extensionContext.newPage();
  await vanPage.goto(`${SERVER_URL}/test-van-custom-domain`);

  // Verify content script is NOT auto-injected (path doesn't match any pattern)
  await vanPage.waitForTimeout(2000);
  expect(
    await vanPage.evaluate(() => !!document.getElementById("turbovpb-insert")),
  ).toBe(false);

  // Simulate the background script's permissions.onAdded handler:
  // inject the content script into the tab (just like background.ts does)
  await serviceWorker.evaluate(async (pageUrl: string) => {
    const tabs = await (globalThis as any).chrome.tabs.query({});
    const tab = tabs.find((t: any) => t.url?.includes(pageUrl));
    if (!tab?.id) throw new Error("Could not find tab for " + pageUrl);

    // Check content script not already injected
    const [result] = await (globalThis as any).chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => !!document.getElementById("turbovpb-insert"),
    });
    if (result?.result) throw new Error("Content script already injected");

    await (globalThis as any).chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["/content-scripts/content.css"],
    });
    await (globalThis as any).chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/content-scripts/content.js"],
    });
  }, "/test-van-custom-domain");

  // Verify the content script initialized and generated a connect URL
  const connectUrl = await getConnectUrl(vanPage);
  expect(connectUrl).toContain("/connect");
  expect(connectUrl).toContain("#");

  // Open the connect page and verify EveryAction-scraped contact appears
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    const nameElement = connectPage.locator("#name");
    await expect(nameElement).toBeVisible({ timeout: 15_000 });
    await expect(nameElement).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
    );

    const phoneElement = connectPage.locator("#phone-number");
    await expect(phoneElement).toHaveText(FIRST_CONTACT.phone);

    const status = connectPage.locator("#status");
    await expect(status).toHaveText("Connected");
  } finally {
    await connectBrowser.close();
    await vanPage.close();
  }
});

test("call result cycles contacts on VAN-style page", async () => {
  const vanPage = await extensionContext.newPage();
  await vanPage.goto(`${SERVER_URL}/test-van-custom-domain`);

  // Inject content script manually (simulating post-permission-grant injection)
  await serviceWorker.evaluate(async (pageUrl: string) => {
    const tabs = await (globalThis as any).chrome.tabs.query({});
    const tab = tabs.find((t: any) => t.url?.includes(pageUrl));
    if (!tab?.id) throw new Error("Could not find tab for " + pageUrl);

    await (globalThis as any).chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["/content-scripts/content.css"],
    });
    await (globalThis as any).chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["/content-scripts/content.js"],
    });
  }, "/test-van-custom-domain");

  const connectUrl = await getConnectUrl(vanPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    // Wait for first contact (Alice) to appear
    await expect(connectPage.locator("#name")).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    // Wait for result buttons (Texted is hidden when message templates are configured)
    await expect(
      connectPage.locator("#call-result-links button"),
    ).toHaveCount(3, { timeout: 10_000 });

    // Click "Left Voicemail" to mark result and load next contact
    await connectPage
      .locator("#call-result-links button", { hasText: "Left Voicemail" })
      .click();

    // Verify Bob is loaded on both pages
    await expect(connectPage.locator("#name")).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    const phonebankName = vanPage.locator("#contactName");
    await expect(phonebankName).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );
  } finally {
    await connectBrowser.close();
    await vanPage.close();
  }
});
