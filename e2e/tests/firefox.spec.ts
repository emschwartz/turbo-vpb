/**
 * Firefox e2e tests that mirror the Chrome test suite.
 *
 * Playwright doesn't natively support Firefox extensions, so we use
 * Firefox's Remote Debugging Protocol to install the extension as a
 * temporary addon (full permissions, no signing needed).
 *
 * Key differences from Chrome tests:
 * - Extension installed via RDP instead of --load-extension flag
 * - Settings configured via the extension's options page (moz-extension://)
 *   instead of service worker evaluation
 * - Connect URL read from the DOM instead of storage.session
 * - Connect page opened in a Chromium browser (not Firefox, since we only
 *   need one browser with the extension)
 */
import {
  test,
  expect,
  firefox,
  chromium,
  BrowserContext,
  Page,
} from "@playwright/test";
import path from "path";
import net from "node:net";
import { fileURLToPath } from "url";
import {
  firefoxExtensionPrefs,
  firefoxExtensionArgs,
  installTemporaryAddon
} from "../lib/firefox-addon";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/firefox-mv3-dev",
);
const GECKO_ID = "{5ac6de74-7640-4236-a7ed-e19b356b666b}";
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

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
const THIRD_CONTACT = {
  firstName: "Carol",
  lastName: "Williams",
  phone: "(555)-246-8135",
};

const MESSAGE_TEMPLATES = [
  {
    label: "Intro",
    message: "Hi [their name], this is [your name] from the campaign.",
    sendTextedResult: false,
  },
  {
    label: "Quick Text",
    message: "Hi [their name], just reaching out!",
    sendTextedResult: true,
    result: "Texted",
  },
];

let firefoxContext: BrowserContext;
let phonebankPage: Page;

function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Inject the content script into tabs matching a URL pattern by sending a
 * message through the dev-only postMessage bridge on a page where the content
 * script is already running (phonebankPage).
 */
async function injectContentScript(urlPattern: string) {
  await phonebankPage.evaluate(
    (pattern) => {
      window.postMessage(
        { type: "turbovpb-test:inject-content-script", urlPattern: pattern },
        "*",
      );
    },
    urlPattern,
  );
  // Give the background script time to inject
  await phonebankPage.waitForTimeout(2000);
}

/**
 * Read the connect URL from the QR code link rendered by the content script.
 * Falls back to polling since the QR code appears after the pubsub client connects.
 */
async function getConnectUrl(page: Page): Promise<string> {
  const link = page.locator('#turbovpb-insert a[href*="/connect"]');
  await expect(link).toBeAttached({ timeout: 15_000 });
  const href = await link.getAttribute("href");
  if (!href) {
    throw new Error("Connect URL link has no href");
  }
  return href;
}

async function openConnectPage(connectUrl: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(connectUrl);
  return { browser, page };
}

test.beforeAll(async () => {
  const rdpPort = await findFreePort();

  firefoxContext = await firefox.launchPersistentContext("", {
    headless: false,
    args: firefoxExtensionArgs(rdpPort),
    firefoxUserPrefs: firefoxExtensionPrefs(rdpPort),
  });

  // Install the extension as a temporary addon via RDP
  await installTemporaryAddon(rdpPort, EXTENSION_PATH, GECKO_ID);

  // Configure extension settings via the dev-only postMessage bridge.
  // Navigate to a page where the content script injects, set storage
  // via postMessage, then reload to pick up the new settings.
  phonebankPage = await firefoxContext.newPage();
  await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
  await expect(phonebankPage.locator("#turbovpb-insert")).toBeAttached({
    timeout: 15_000,
  });
  await phonebankPage.evaluate(
    (settings) => {
      window.postMessage(
        { type: "turbovpb-test:storage.local.set", data: settings },
        "*",
      );
    },
    {
      serverUrl: SERVER_URL,
      yourName: "Test Volunteer",
      messageTemplates: MESSAGE_TEMPLATES,
    },
  );
  // Wait for storage.local.set to complete, then reload so the content
  // script picks up the new serverUrl on initialization
  await phonebankPage.waitForTimeout(1000);
  await phonebankPage.reload();
});

test.afterAll(async () => {
  await firefoxContext?.close();
});

test("contact details flow from extension to connect page", async () => {
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  expect(connectUrl).toContain("/connect");
  expect(connectUrl).toContain("#");

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
  }
});

test("call result flows back from connect page to extension", async () => {
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#name")).toBeVisible({ timeout: 15_000 });
    await expect(connectPage.locator("#call-result-links button")).toHaveCount(
      3,
      { timeout: 10_000 },
    );

    await connectPage
      .locator("#call-result-links button", { hasText: "Left Voicemail" })
      .click();

    const contactName = phonebankPage.locator("#contactName");
    await expect(contactName).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    const connectName = connectPage.locator("#name");
    await expect(connectName).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );
  } finally {
    await connectBrowser.close();
  }
});

test("reconnection after extension page reload", async () => {
  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#name")).toBeVisible({ timeout: 15_000 });

    // Reload the phonebank page (extension should reconnect with same channel
    // via storage.session persisted through background script proxy)
    await phonebankPage.reload();

    const connectName = connectPage.locator("#name");
    await expect(connectName).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 20_000 },
    );

    const status = connectPage.locator("#status");
    await expect(status).toHaveText("Connected");
  } finally {
    await connectBrowser.close();
  }
});

test("message template placeholders are substituted on connect page", async () => {
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#name")).toBeVisible({ timeout: 15_000 });
    const textLinks = connectPage.locator("#text-message-links a");
    await expect(textLinks).toHaveCount(2, { timeout: 10_000 });

    const introLink = textLinks.nth(0);
    const introHref = await introLink.getAttribute("href");
    const expectedMessage = `Hi ${FIRST_CONTACT.firstName}, this is Test Volunteer from the campaign.`;
    expect(introHref).toContain(encodeURIComponent(expectedMessage));

    await expect(introLink.locator("span")).toHaveText("Intro");

    const quickTextLink = textLinks.nth(1);
    await expect(quickTextLink.locator("span")).toHaveText("Quick Text");
  } finally {
    await connectBrowser.close();
  }
});

test("text message with auto-save sends call result and loads next contact", async () => {
  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#name")).toBeVisible({ timeout: 15_000 });
    const textLinks = connectPage.locator("#text-message-links a");
    await expect(textLinks).toHaveCount(2, { timeout: 10_000 });

    const currentName = await connectPage.locator("#name").textContent();

    const quickTextLink = textLinks.nth(1);
    await quickTextLink.evaluate((el: HTMLAnchorElement) => {
      el.addEventListener(
        "click",
        (e) => {
          e.preventDefault();
        },
        { capture: true, once: true },
      );
    });
    await quickTextLink.click();

    const connectName = connectPage.locator("#name");
    await expect(connectName).not.toHaveText(currentName!, { timeout: 15_000 });
  } finally {
    await connectBrowser.close();
  }
});

test("multiple contacts cycle correctly with stats", async () => {
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#name")).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 15_000 },
    );
    await expect(connectPage.locator("#call-result-links button")).toHaveCount(
      3,
      { timeout: 10_000 },
    );

    await connectPage
      .locator("#call-result-links button", { hasText: "Refused" })
      .click();
    await expect(connectPage.locator("#name")).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    await connectPage
      .locator("#call-result-links button", { hasText: "Busy" })
      .click();
    await expect(connectPage.locator("#name")).toHaveText(
      `${THIRD_CONTACT.firstName} ${THIRD_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    await connectPage
      .locator("#call-result-links button", { hasText: "Left Voicemail" })
      .click();
    await expect(connectPage.locator("#name")).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    const numCalls = connectPage.locator("#num-calls");
    await expect(numCalls).toContainText("Call", { timeout: 5_000 });
    const callsText = await numCalls.textContent();
    const callCount = parseInt(callsText!);
    expect(callCount).toBeGreaterThanOrEqual(3);
  } finally {
    await connectBrowser.close();
  }
});

test("connect page shows session complete when phonebank page closes", async () => {
  const pbPage = await firefoxContext.newPage();
  await pbPage.goto(`${SERVER_URL}/test-phonebank`);

  const connectUrl = await getConnectUrl(pbPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#status")).toHaveText("Connected", {
      timeout: 15_000,
    });

    await pbPage.close();

    await expect(connectPage.locator("#status")).toHaveText("Session Complete", {
      timeout: 15_000,
    });
    await expect(connectPage.locator("#session-ended")).toBeVisible();
  } finally {
    await connectBrowser.close();
  }
});

test("extension shows waiting status when connect page closes", async () => {
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#status")).toHaveText("Connected", {
      timeout: 15_000,
    });

    const extensionStatus = phonebankPage.locator("#turbovpb-insert");
    await expect(extensionStatus).toContainText("Connected", {
      timeout: 5_000,
    });

    await connectBrowser.close();

    await expect(extensionStatus).toContainText("Scan QR code to connect", {
      timeout: 10_000,
    });
  } finally {
    try {
      await connectBrowser.close();
    } catch {
      // already closed
    }
  }
});

// --- VAN custom domain tests ---
// These test the EveryAction/VoteBuilder scraper on the VAN-style test page,
// which requires manual content script injection since its path doesn't match
// any content_scripts patterns.

test("content script not auto-injected on VAN custom domain path", async () => {
  const vanPage = await firefoxContext.newPage();
  await vanPage.goto(`${SERVER_URL}/test-van-custom-domain`);

  const hasVanMarkers = await vanPage.evaluate(
    () =>
      document.querySelector(".van-header") !== null ||
      document.querySelector(".van-inner") !== null,
  );
  expect(hasVanMarkers).toBe(true);

  // Content script should NOT auto-inject (path doesn't match patterns)
  await vanPage.waitForTimeout(3000);
  const hasContentScript = await vanPage.evaluate(
    () => !!document.getElementById("turbovpb-insert"),
  );
  expect(hasContentScript).toBe(false);

  await vanPage.close();
});

test("VAN-style page works after manual content script injection", async () => {
  const vanPage = await firefoxContext.newPage();
  await vanPage.goto(`${SERVER_URL}/test-van-custom-domain`);

  // Inject content script via the background script.
  // Use pattern without port: Firefox ignores ports in match patterns (Bug 1362809).
  await injectContentScript("http://localhost/test-van-custom-domain*");

  const connectUrl = await getConnectUrl(vanPage);
  expect(connectUrl).toContain("/connect");

  // Open the connect page and verify the EveryAction-scraped contact appears
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
  } finally {
    await connectBrowser.close();
    await vanPage.close();
  }
});

test("duplicate callResult messages do not mark additional contacts", async () => {
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#name")).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 15_000 },
    );
    await expect(connectPage.locator("#call-result-links button")).toHaveCount(
      3,
      { timeout: 10_000 },
    );

    // Click "Left Voicemail" - marks Alice, advances to Bob
    await connectPage
      .locator("#call-result-links button", { hasText: "Left Voicemail" })
      .click();

    const contactName = phonebankPage.locator("#contactName");
    await expect(contactName).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    // Inject duplicate callResult messages with Alice's phone number.
    // These should be ignored because the current contact is Bob.
    for (let i = 0; i < 3; i++) {
      await phonebankPage.evaluate(
        ({ phone, seq }) => {
          window.postMessage(
            {
              type: "turbovpb-test:inject-call-result",
              message: {
                type: "callResult",
                result: "Left Voicemail",
                phoneNumber: phone,
                seq,
              },
            },
            "*",
          );
        },
        { phone: FIRST_CONTACT.phone, seq: 900 + i },
      );
    }

    await phonebankPage.waitForTimeout(2000);

    // Verify the page still shows Bob (did NOT advance to Carol)
    await expect(contactName).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
    );
  } finally {
    await connectBrowser.close();
  }
});

test("callResult with mismatched phone number does not mark contact", async () => {
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#name")).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    // Inject a callResult with a completely wrong phone number
    await phonebankPage.evaluate(() => {
      window.postMessage(
        {
          type: "turbovpb-test:inject-call-result",
          message: {
            type: "callResult",
            result: "Left Voicemail",
            phoneNumber: "9999999999",
            seq: 800,
          },
        },
        "*",
      );
    });

    await phonebankPage.waitForTimeout(2000);

    // Verify Alice is still the current contact (was NOT marked)
    const contactName = phonebankPage.locator("#contactName");
    await expect(contactName).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
    );
  } finally {
    await connectBrowser.close();
  }
});

test("call result cycles contacts on VAN-style page", async () => {
  const vanPage = await firefoxContext.newPage();
  await vanPage.goto(`${SERVER_URL}/test-van-custom-domain`);

  await injectContentScript("http://localhost/test-van-custom-domain*");

  const connectUrl = await getConnectUrl(vanPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    await expect(connectPage.locator("#name")).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    await expect(
      connectPage.locator("#call-result-links button"),
    ).toHaveCount(3, { timeout: 10_000 });

    await connectPage
      .locator("#call-result-links button", { hasText: "Left Voicemail" })
      .click();

    await expect(connectPage.locator("#name")).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    // The name span includes an age/gender suffix matching real VoteBuilder
    const phonebankName = vanPage.locator("#contactName");
    await expect(phonebankName).toContainText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );
  } finally {
    await connectBrowser.close();
    await vanPage.close();
  }
});
