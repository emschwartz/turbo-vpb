import {
  test,
  expect,
  chromium,
  Browser,
  BrowserContext,
  Page,
  WebSocketRoute,
} from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

// These tests cover connection events that happen during normal use (the
// phone's browser being backgrounded for every call, sockets dropping and
// reconnecting) and check that they don't break or end the session.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/chrome-mv3-dev",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

const FIRST_CONTACT = "Alice Johnson";
const SECOND_CONTACT = "Bob Smith";

// The connect page waits this long after the extension disconnects before
// showing "Extension disconnected" and then ending the session
// (PEER_DISCONNECTED_GRACE_PERIOD + PEER_DISCONNECTED_TIMEOUT)
const PEER_DISCONNECTED_TOTAL_MS = 8_000;

let extensionContext: BrowserContext;
let phonebankPage: Page;

test.describe.configure({ mode: "serial" });

async function launchExtensionContext(serverUrl: string) {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      "--no-first-run",
      "--disable-gpu",
      "--no-default-browser-check",
    ],
  });
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }
  await serviceWorker.evaluate(
    (serverUrl) => (globalThis as any).chrome.storage.local.set({ serverUrl }),
    serverUrl,
  );
  return context;
}

test.beforeAll(async () => {
  extensionContext = await launchExtensionContext(SERVER_URL);
  phonebankPage = await extensionContext.newPage();
  await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
});

test.afterAll(async () => {
  await extensionContext?.close();
});

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

function channelIdFromConnectUrl(connectUrl: string): string {
  return new URL(connectUrl).hash.slice(1).replace(/&.*/, "");
}

type Phone = {
  browser: Browser;
  page: Page;
  // Number of WebSocket connections the page has made to the server
  connectionCount: () => number;
  // Drop the current WebSocket connection, as the phone's OS does when the
  // browser is in the background or the network changes during a call
  dropConnection: () => Promise<void>;
  // While the network is down, new WebSocket connections fail right away
  setNetworkDown: (down: boolean) => void;
};

/**
 * Open the connect page in a separate browser, simulating the phone, with
 * its WebSocket connections routed through Playwright so the test can drop
 * them.
 */
async function connectPhone(connectUrl: string): Promise<Phone> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sockets: WebSocketRoute[] = [];
  let connections = 0;
  let networkDown = false;
  await page.routeWebSocket(/\/api\/channels\/[^/]+\/browser$/, (ws) => {
    if (networkDown) {
      ws.close();
      return;
    }
    connections++;
    ws.connectToServer();
    sockets.push(ws);
  });
  await page.goto(connectUrl);
  await expect(page.locator("#status")).toHaveText("Connected", {
    timeout: 15_000,
  });
  return {
    browser,
    page,
    connectionCount: () => connections,
    dropConnection: async () => {
      for (const ws of sockets.splice(0)) {
        await ws.close();
      }
    },
    setNetworkDown: (down) => {
      networkDown = down;
    },
  };
}

/**
 * Simulate the phone's browser being hidden (the volunteer switched to the
 * dialer or messaging app) or shown again.
 */
async function setPhoneVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate((state) => {
    const w = window as any;
    if (!w.__visibilityOverridden) {
      w.__visibilityOverridden = true;
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => w.__visibilityState,
      });
    }
    w.__visibilityState = state;
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

/**
 * Open a raw WebSocket to the channel and close it again, the way the server
 * sees a stale connection from a peer that already reconnected on a new
 * socket (e.g. after a network change).
 */
async function openAndCloseStaleSocket(
  channelId: string,
  identity: "extension" | "browser",
) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${SERVER_URL}/api/status`);
    await page.evaluate(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(url);
          ws.onerror = () => reject(new Error("stale socket failed to open"));
          ws.onopen = () => {
            setTimeout(() => {
              ws.close();
              resolve();
            }, 500);
          };
        }),
      `${SERVER_URL.replace("http", "ws")}/api/channels/${channelId}/${identity}`,
    );
  } finally {
    await browser.close();
  }
}

async function expectStatusToStay(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  text: string,
  durationMs: number,
) {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    // (A timeout of 0 would mean no timeout)
    await expect(locator).toContainText(text, { timeout: 100 });
    await page.waitForTimeout(250);
  }
}

test("phone session continues when a stale extension socket closes", async () => {
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await openAndCloseStaleSocket(
      channelIdFromConnectUrl(connectUrl),
      "extension",
    );

    // The extension is still connected, so the phone must not show it as
    // disconnected or end the session
    await expectStatusToStay(
      phone.page,
      phone.page.locator("#status"),
      "Connected",
      PEER_DISCONNECTED_TOTAL_MS + 2_000,
    );
    await expect(phone.page.locator("#session-ended")).toBeHidden();
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
  } finally {
    await phone.browser.close();
  }
});

test("extension stays connected when a stale phone socket closes", async () => {
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(sidebarInsert(phonebankPage)).toContainText("Connected", {
      timeout: 15_000,
    });

    await openAndCloseStaleSocket(
      channelIdFromConnectUrl(connectUrl),
      "browser",
    );

    await expectStatusToStay(
      phonebankPage,
      sidebarInsert(phonebankPage),
      "Connected",
      3_000,
    );
  } finally {
    await phone.browser.close();
  }
});

async function markResultOnPhoneAndExpectNextContact(phone: Phone) {
  const page = phone.page;
  await expect(page.locator("#name")).toHaveText(FIRST_CONTACT, {
    timeout: 15_000,
  });
  await page
    .locator("#call-result-links button", { hasText: "Left Voicemail" })
    .click();
  // The next contact comes back over the WebSocket, so this only works if
  // the phone reconnected
  await expect(page.locator("#name")).toHaveText(SECOND_CONTACT, {
    timeout: 8_000,
  });
  await expect(phonebankPage.locator("#contactName")).toHaveText(
    SECOND_CONTACT,
  );
}

test("phone reconnects when its socket drops after returning from a call", async () => {
  await phonebankPage.reload();
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    // A quick call or text: the socket survives while the browser is in
    // the background
    await setPhoneVisibility(phone.page, "hidden");
    await setPhoneVisibility(phone.page, "visible");
    await phone.page.waitForTimeout(1_000);
    await expect(phone.page.locator("#status")).toHaveText("Connected");

    // On the next call, the socket is dropped
    const connections = phone.connectionCount();
    await phone.dropConnection();

    await expect.poll(phone.connectionCount, { timeout: 5_000 }).toBe(
      connections + 1,
    );
    await expect(phone.page.locator("#status")).toHaveText("Connected");
    await markResultOnPhoneAndExpectNextContact(phone);
  } finally {
    await phone.browser.close();
  }
});

test("phone reconnects when it returns after failing to reconnect in the background", async () => {
  await phonebankPage.reload();
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    // During the call the browser is in the background and has no network
    // (e.g. a carrier without simultaneous voice and data), so its socket
    // drops and its attempts to reconnect fail
    await setPhoneVisibility(phone.page, "hidden");
    phone.setNetworkDown(true);
    const connections = phone.connectionCount();
    await phone.dropConnection();
    await phone.page.waitForTimeout(2_000);

    // The volunteer hangs up and switches back to the browser
    phone.setNetworkDown(false);
    await setPhoneVisibility(phone.page, "visible");

    await expect.poll(phone.connectionCount, { timeout: 5_000 }).toBe(
      connections + 1,
    );
    await expect(phone.page.locator("#status")).toHaveText("Connected");
    await expect(phone.page.locator("#warning-container")).toBeHidden();
    await markResultOnPhoneAndExpectNextContact(phone);
  } finally {
    await phone.browser.close();
  }
});
