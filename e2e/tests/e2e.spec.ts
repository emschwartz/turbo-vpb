import { test, expect, chromium, BrowserContext, Page } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Use the dev build which includes http://localhost/* in content_scripts,
// needed for testing against the local server.
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/chrome-mv3-dev",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// First contact from the hardcoded list in test-phonebank.html
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
    // The connect page uses the "result" field for auto-save
    result: "Texted",
  },
];

let extensionContext: BrowserContext;
let phonebankPage: Page;

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

  // Find the extension's background/service worker and set serverUrl
  let serviceWorker = extensionContext.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await extensionContext.waitForEvent("serviceworker");
  }

  // Set extension settings: server URL, your name, and message templates
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

  // Navigate to the test phonebank page
  phonebankPage = await extensionContext.newPage();
  await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
});

test.afterAll(async () => {
  await extensionContext?.close();
});

/**
 * Extract the connect URL from the QR code link rendered by the content script.
 * This reads from the DOM instead of storage.session, avoiding the race condition
 * where serviceWorker.evaluate() blocks the service worker's event loop and
 * prevents runtime.onMessage from processing storage writes.
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

/**
 * Open the connect page in a separate browser (no extension needed)
 * and wait for the contact details to appear.
 */
async function openConnectPage(connectUrl: string): Promise<{
  browser: Awaited<ReturnType<typeof chromium.launch>>;
  page: Page;
}> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(connectUrl);
  return { browser, page };
}

test("contact details flow from extension to connect page", async () => {
  // Reload to ensure we start with the first contact
  await phonebankPage.reload();

  // Wait for the extension to inject its UI and generate the QR code
  const connectUrl = await getConnectUrl(phonebankPage);
  expect(connectUrl).toContain("/connect");
  expect(connectUrl).toContain("#"); // hash contains channelId&encryptionKey

  // Open the connect page in a separate browser (simulating the phone)
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    // Wait for the contact name to appear on the connect page
    const nameElement = connectPage.locator("#name");
    await expect(nameElement).toBeVisible({ timeout: 15_000 });
    await expect(nameElement).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
    );

    // Verify phone number is displayed
    const phoneElement = connectPage.locator("#phone-number");
    await expect(phoneElement).toHaveText(FIRST_CONTACT.phone);

    // Verify the status shows connected
    const status = connectPage.locator("#status");
    await expect(status).toHaveText("Connected");
  } finally {
    await connectBrowser.close();
  }
});

test("call result flows back from connect page to extension", async () => {
  // Reload to ensure we start with the first contact
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    // Wait for contact details and result buttons to load
    await expect(connectPage.locator("#name")).toBeVisible({ timeout: 15_000 });
    // When message templates are configured, the "Texted" button is hidden
    await expect(connectPage.locator("#call-result-links button")).toHaveCount(
      3,
      { timeout: 10_000 },
    );

    // Click the "Left Voicemail" result button
    const leftVoicemailButton = connectPage.locator(
      "#call-result-links button",
      { hasText: "Left Voicemail" },
    );
    await leftVoicemailButton.click();

    // The extension should mark the result and load the next contact.
    // On the test-phonebank page, markResult clicks the radio button and
    // the "Save Results & Load Next" button, which calls nextContact().
    // Wait for the contact name to change to the second contact.
    const contactName = phonebankPage.locator("#contactName");
    await expect(contactName).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    // The connect page should also update with the new contact
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
    // Wait for initial connection and contact to load
    await expect(connectPage.locator("#name")).toBeVisible({ timeout: 15_000 });

    // Reload the test-phonebank page (extension will reconnect)
    await phonebankPage.reload();

    // Wait for the content script to re-inject after reload.
    await expect(phonebankPage.locator("#turbovpb-insert")).toBeAttached({
      timeout: 15_000,
    });

    // Wait for the extension to reconnect and the connect page to update.
    // After reload, the content script loads the previous channelId from
    // storage.session (via background message passing), reconnects to the
    // server, and sends the updated contact. This can take time if the
    // service worker needs to wake up for the storage read.
    const connectName = connectPage.locator("#name");
    await expect(connectName).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 30_000 },
    );

    // Verify the connect page status shows connected (not disconnected)
    const status = connectPage.locator("#status");
    await expect(status).toHaveText("Connected");
  } finally {
    await connectBrowser.close();
  }
});

test("message template placeholders are substituted on connect page", async () => {
  // Reload to ensure we start with the first contact (Alice)
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    // Wait for contact and text message links to load
    await expect(connectPage.locator("#name")).toBeVisible({ timeout: 15_000 });
    const textLinks = connectPage.locator("#text-message-links a");
    await expect(textLinks).toHaveCount(2, { timeout: 10_000 });

    // Check that [their name] and [your name] are both replaced
    const introLink = textLinks.nth(0);
    const introHref = await introLink.getAttribute("href");
    const expectedMessage = `Hi ${FIRST_CONTACT.firstName}, this is Test Volunteer from the campaign.`;
    expect(introHref).toContain(encodeURIComponent(expectedMessage));

    // Verify the label is displayed
    await expect(introLink.locator("span")).toHaveText("Intro");

    // Verify the second template label
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

    // Note which contact is currently loaded
    const currentName = await connectPage.locator("#name").textContent();

    // Click the "Quick Text" link which has result: "Texted" (auto-save enabled)
    // Prevent the default navigation to sms:// which would fail in the test browser
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

    // The connect page should send a callResult with "Texted" back to the extension,
    // which will mark the result and load the next contact
    const connectName = connectPage.locator("#name");
    await expect(connectName).not.toHaveText(currentName, { timeout: 15_000 });
  } finally {
    await connectBrowser.close();
  }
});

test("multiple contacts cycle correctly with stats", async () => {
  // Reload to reset contact index to Alice
  await phonebankPage.reload();

  const connectUrl = await getConnectUrl(phonebankPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    // Verify first contact (Alice)
    await expect(connectPage.locator("#name")).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 15_000 },
    );
    // When message templates are configured, the "Texted" button is hidden
    await expect(connectPage.locator("#call-result-links button")).toHaveCount(
      3,
      { timeout: 10_000 },
    );

    // Mark result -> loads Bob
    await connectPage
      .locator("#call-result-links button", { hasText: "Refused" })
      .click();
    await expect(connectPage.locator("#name")).toHaveText(
      `${SECOND_CONTACT.firstName} ${SECOND_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    // Mark result -> loads Carol
    await connectPage
      .locator("#call-result-links button", { hasText: "Busy" })
      .click();
    await expect(connectPage.locator("#name")).toHaveText(
      `${THIRD_CONTACT.firstName} ${THIRD_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    // Mark result -> wraps back to Alice
    await connectPage
      .locator("#call-result-links button", { hasText: "Left Voicemail" })
      .click();
    await expect(connectPage.locator("#name")).toHaveText(
      `${FIRST_CONTACT.firstName} ${FIRST_CONTACT.lastName}`,
      { timeout: 15_000 },
    );

    // Verify stats updated on the connect page
    const numCalls = connectPage.locator("#num-calls");
    await expect(numCalls).toContainText("Call", { timeout: 5_000 });
    // Stats should show at least the calls from this test
    const callsText = await numCalls.textContent();
    const callCount = parseInt(callsText);
    expect(callCount).toBeGreaterThanOrEqual(3);
  } finally {
    await connectBrowser.close();
  }
});

test("connect page shows session complete when phonebank page closes", async () => {
  // Open a separate phonebank page so we can close it without affecting other tests
  const pbPage = await extensionContext.newPage();
  await pbPage.goto(`${SERVER_URL}/test-phonebank`);

  const connectUrl = await getConnectUrl(pbPage);
  const { browser: connectBrowser, page: connectPage } =
    await openConnectPage(connectUrl);

  try {
    // Wait for the connect page to be fully connected
    await expect(connectPage.locator("#status")).toHaveText("Connected", {
      timeout: 15_000,
    });

    // Close the phonebank page (simulates user closing the tab).
    // The server detects the WebSocket close and notifies the connect page.
    // After a grace period + timeout, the connect page marks session complete.
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
    // Wait for connection to be established
    await expect(connectPage.locator("#status")).toHaveText("Connected", {
      timeout: 15_000,
    });

    // Verify the extension shows connected
    const extensionStatus = phonebankPage.locator("#turbovpb-insert");
    await expect(extensionStatus).toContainText("Connected", {
      timeout: 5_000,
    });

    // Close the connect page (simulates user closing the mobile tab)
    await connectBrowser.close();

    // The extension should revert to "Scan QR code to connect"
    await expect(extensionStatus).toContainText("Scan QR code to connect", {
      timeout: 10_000,
    });
  } finally {
    // connectBrowser already closed above, but handle the case where test fails early
    try {
      await connectBrowser.close();
    } catch {
      // already closed
    }
  }
});
