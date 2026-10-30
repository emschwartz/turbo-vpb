import {
  test,
  expect,
  chromium,
  Browser,
  BrowserContext,
  Page,
  WebSocketRoute,
} from "@playwright/test";
import http from "http";
import net from "net";
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
// showing "Extension disconnected" (PEER_DISCONNECTED_GRACE_PERIOD), and
// this long in total before showing "Session Complete"
// (PEER_DISCONNECTED_GRACE_PERIOD + PEER_DISCONNECTED_TIMEOUT)
const PEER_DISCONNECTED_GRACE_MS = 3_000;
const PEER_DISCONNECTED_TOTAL_MS = 30_000;

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
async function connectPhone(
  connectUrl: string,
  { startWithNetworkDown = false } = {},
): Promise<Phone> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const sockets: WebSocketRoute[] = [];
  let connections = 0;
  let networkDown = startWithNetworkDown;
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
  if (!startWithNetworkDown) {
    await expect(page.locator("#status")).toHaveText("Connected", {
      timeout: 15_000,
    });
  }
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
 * Open a raw WebSocket to the channel, the way the server sees a connection
 * from a peer that has another socket open (e.g. one it reconnected on
 * after a network change, before the server noticed the old one was dead).
 * Returns a function that closes it.
 */
async function holdSocketOpen(
  channelId: string,
  identity: "extension" | "browser",
): Promise<() => Promise<void>> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${SERVER_URL}/api/status`);
  await page.evaluate(
    (url) =>
      new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.onerror = () => reject(new Error("raw socket failed to open"));
        ws.onopen = () => resolve();
      }),
    `${SERVER_URL.replace("http", "ws")}/api/channels/${channelId}/${identity}`,
  );
  return () => browser.close();
}

async function openAndCloseStaleSocket(
  channelId: string,
  identity: "extension" | "browser",
) {
  const close = await holdSocketOpen(channelId, identity);
  await new Promise((resolve) => setTimeout(resolve, 500));
  await close();
}

function isSnackbarShown(page: Page): Promise<boolean> {
  return page
    .locator("#snackbar")
    .evaluate((el) => el.classList.contains("show"));
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
      PEER_DISCONNECTED_GRACE_MS + 2_000,
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

test("phone keeps retrying through a long network outage while visible", async () => {
  await phonebankPage.reload();
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    // e.g. walking out of Wi-Fi range with the page open. This used to give
    // up after two quick retries, until the page was hidden and shown again.
    phone.setNetworkDown(true);
    const connections = phone.connectionCount();
    await phone.dropConnection();
    await phone.page.waitForTimeout(10_000);

    phone.setNetworkDown(false);
    await expect
      .poll(phone.connectionCount, { timeout: 15_000 })
      .toBe(connections + 1);
    await expect(phone.page.locator("#status")).toHaveText("Connected");
    await expect(phone.page.locator("#warning-container")).toBeHidden();
    await markResultOnPhoneAndExpectNextContact(phone);
  } finally {
    await phone.browser.close();
  }
});

test("phone recovers after its connection times out", async () => {
  await phonebankPage.reload();
  const connectUrl = await getConnectUrl(phonebankPage);
  // The phone opens the page with a bad connection
  const phone = await connectPhone(connectUrl, { startWithNetworkDown: true });
  try {
    // The 15 second connection timeout shows an error. This used to also
    // stop the phone from ever connecting.
    await expect(phone.page.locator("#status")).toHaveText(
      "Error. Reload Tab.",
      { timeout: 25_000 },
    );

    phone.setNetworkDown(false);
    await expect(phone.page.locator("#status")).toHaveText("Connected", {
      timeout: 15_000,
    });
    await expect(phone.page.locator("#warning-container")).toBeHidden();
    await markResultOnPhoneAndExpectNextContact(phone);
  } finally {
    await phone.browser.close();
  }
});

test("confetti plays once per milestone, not again on every reconnect", async () => {
  // Start one call away from the 10-call milestone. The session is stored
  // per tab (see TabSessionStorage), so find the phone bank tab's id.
  const serviceWorker = extensionContext.serviceWorkers()[0];
  await serviceWorker.evaluate(async (url) => {
    const chrome = (globalThis as any).chrome;
    const [tab] = await chrome.tabs.query({ url: `${url}*` });
    await chrome.storage.session.set({
      [`tab:${tab.id}:turboVpbStats`]: {
        calls: 9,
        successfulCalls: 0,
        startTime: Date.now(),
      },
    });
  }, phonebankPage.url());
  await phonebankPage.reload();
  const phone = await connectPhone(await getConnectUrl(phonebankPage));
  try {
    await expect(phone.page.locator("#num-calls")).toHaveText("9 Calls");
    const countConfetti = async () => {
      await phone.page.evaluate(() => {
        const w = window as any;
        if (w.__confettiCount === undefined) {
          w.__confettiCount = 0;
          w.confetti.start = () => w.__confettiCount++;
        }
      });
    };
    const confettiCount = () =>
      phone.page.evaluate(() => (window as any).__confettiCount as number);
    await countConfetti();

    await markResultOnPhoneAndExpectNextContact(phone);
    await expect(phone.page.locator("#num-calls")).toHaveText("10 Calls");
    await expect.poll(confettiCount).toBe(1);

    // The phone reconnects after the next call (the server replays the
    // extension's last message and the extension re-sends the contact)
    const connections = phone.connectionCount();
    await phone.dropConnection();
    await expect
      .poll(phone.connectionCount, { timeout: 5_000 })
      .toBe(connections + 1);
    await expect(phone.page.locator("#status")).toHaveText("Connected");
    await phone.page.waitForTimeout(1_000);
    expect(await confettiCount()).toBe(1);

    // And the phone page is reloaded. Count from before the page's scripts
    // run, since the stats arrive as soon as it connects.
    await phone.page.addInitScript(() => {
      const w = window as any;
      w.__confettiCount = 0;
      let wrapped: unknown;
      Object.defineProperty(w, "confetti", {
        configurable: true,
        get: () => wrapped,
        set: (value) => {
          wrapped = new Proxy(value, {
            get: (target, prop) =>
              prop === "start" ? () => w.__confettiCount++ : target[prop],
          });
        },
      });
    });
    await phone.page.reload();
    await expect(phone.page.locator("#num-calls")).toHaveText("10 Calls");
    await phone.page.waitForTimeout(1_000);
    expect(await confettiCount()).toBe(0);
  } finally {
    await phone.browser.close();
  }
});

async function reopenPhonebankPage() {
  // A new tab in the same browser session reuses the stored channel
  phonebankPage = await extensionContext.newPage();
  await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
}

test("a rejected call result is not announced again when the phone reconnects after a call", async () => {
  await phonebankPage.reload();
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    // The phone bank page can't mark this result, so the extension rejects
    // it and the phone says so
    await phonebankPage.evaluate(() =>
      document.getElementById("busy")!.parentElement!.remove(),
    );
    const snackbar = phone.page.locator("#snackbar");
    await phone.page
      .locator("#call-result-links button", { hasText: "Busy" })
      .click();
    await expect(snackbar).toHaveClass(/show/);
    await expect(snackbar).not.toHaveClass(/show/, { timeout: 10_000 });

    // The volunteer makes a call. On reconnecting, the server replays the
    // extension's last message, which is that rejection.
    const connections = phone.connectionCount();
    await phone.dropConnection();
    await expect.poll(phone.connectionCount, { timeout: 5_000 }).toBe(
      connections + 1,
    );
    await expect(phone.page.locator("#status")).toHaveText("Connected");
    await phone.page.waitForTimeout(1_000);
    // Checked once, now: a retrying assertion would pass once it hides
    expect(await isSnackbarShown(phone.page)).toBe(false);
    await expect(phone.page.locator("#contact-details")).toBeVisible();
  } finally {
    await phone.browser.close();
  }
});

test("extension shows the phone as away, not connected, after a page load while the phone is gone", async () => {
  await phonebankPage.reload();
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  // Another extension socket (e.g. one the server hasn't yet noticed is
  // dead after a network blip) keeps the channel, and the phone's last
  // message, alive across the page load
  const closeOtherSocket = await holdSocketOpen(
    channelIdFromConnectUrl(connectUrl),
    "extension",
  );
  try {
    // The volunteer closes the phone's browser
    await phone.browser.close();
    await expect(sidebarInsert(phonebankPage)).toContainText(
      "Waiting for phone to reconnect",
    );

    // e.g. VAN loading the next contact. The server replays the phone's
    // last message to the new page, which used to make it think the phone
    // was back.
    await phonebankPage.reload();
    await expect(sidebarInsert(phonebankPage)).toContainText(
      "Waiting for phone to reconnect",
      { timeout: 15_000 },
    );
    await expectStatusToStay(
      phonebankPage,
      sidebarInsert(phonebankPage),
      "Waiting for phone to reconnect",
      3_000,
    );
  } finally {
    await closeOtherSocket();
  }
});

test("phone shows the extension as connected when its page has no contact", async () => {
  // e.g. the list is finished, or the contact couldn't be scraped.
  // (Tabs in the same browser share the phone's channel, so the tab with a
  // contact has to go.)
  await phonebankPage.close();
  const emptyPage = await extensionContext.newPage();
  await emptyPage.goto(`${SERVER_URL}/test-phonebank?empty`);
  const phone = await connectPhone(await getConnectUrl(emptyPage));
  try {
    await expectStatusToStay(
      phone.page,
      phone.page.locator("#status"),
      "Connected",
      16_000,
    );
    await expect(phone.page.locator("#warning-container")).toBeHidden();
    await expect(phone.page.locator("#contact-details")).toBeHidden();
  } finally {
    await phone.browser.close();
    await emptyPage.close();
    await reopenPhonebankPage();
  }
});

test("phone session survives a slow phone bank page load", async () => {
  await phonebankPage.reload();
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

    // e.g. VAN taking a while to load the next contact
    await phonebankPage.close();
    const status = phone.page.locator("#status");
    await expect(status).toHaveText("Extension disconnected", {
      timeout: PEER_DISCONNECTED_GRACE_MS + 5_000,
    });
    // This used to end the session after 8 seconds
    await expectStatusToStay(
      phone.page,
      status,
      "Extension disconnected",
      8_000,
    );

    await reopenPhonebankPage();
    await expect(status).toHaveText("Connected", { timeout: 15_000 });
    await expect(phone.page.locator("#session-ended")).toBeHidden();
    await markResultOnPhoneAndExpectNextContact(phone);
  } finally {
    await phone.browser.close();
    if (phonebankPage.isClosed()) {
      await reopenPhonebankPage();
    }
  }
});

test("phone session resumes when the extension comes back after the session ended", async () => {
  test.setTimeout(120_000);
  await phonebankPage.reload();
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    const status = phone.page.locator("#status");

    await phonebankPage.close();
    await expect(status).toHaveText("Session Complete", {
      timeout: PEER_DISCONNECTED_TOTAL_MS + 10_000,
    });
    await expect(phone.page.locator("#session-ended")).toBeVisible();

    // Reloading the phone page while the extension is gone still shows the
    // session as complete, not an error or the last (stale) contact
    await phone.page.reload();
    await expectStatusToStay(phone.page, status, "Session Complete", 3_000);
    await expect(phone.page.locator("#warning-container")).toBeHidden();
    await expect(phone.page.locator("#contact-details")).toBeHidden();

    // The volunteer reopens the phone bank tab
    await reopenPhonebankPage();
    await expect(status).toHaveText("Connected", { timeout: 15_000 });
    await expect(phone.page.locator("#session-ended")).toBeHidden();
    await markResultOnPhoneAndExpectNextContact(phone);
  } finally {
    await phone.browser.close();
    if (phonebankPage.isClosed()) {
      await reopenPhonebankPage();
    }
  }
});

/**
 * A proxy in front of the test server that can refuse WebSocket
 * connections, to simulate the server being briefly unreachable.
 */
async function startProxy() {
  let refuseWebSockets = false;
  const target = { host: "127.0.0.1", port: Number(SERVER_PORT) };
  const server = http.createServer((req, res) => {
    const upstream = http.request(
      { ...target, method: req.method, path: req.url, headers: req.headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  server.on("upgrade", (req, socket, head) => {
    if (refuseWebSockets) {
      socket.destroy();
      return;
    }
    const upstream = net.connect(target, () => {
      let request = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        request += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      }
      upstream.write(request + "\r\n");
      upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    upstream.on("close", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  return {
    url: `http://localhost:${port}`,
    setRefuseWebSockets: (refuse: boolean) => {
      refuseWebSockets = refuse;
    },
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

test("extension recovers when its first connection to the server fails", async () => {
  // Fresh context, so there is no stored channel from an earlier page load
  const proxy = await startProxy();
  const context = await launchExtensionContext(proxy.url);
  try {
    // e.g. VAN loads the page while the laptop is still reconnecting to
    // Wi-Fi after waking up
    proxy.setRefuseWebSockets(true);
    const page = await context.newPage();
    await page.goto(`${proxy.url}/test-phonebank`);
    await expect(sidebarInsert(page)).toContainText("Reconnecting", {
      timeout: 15_000,
    });

    proxy.setRefuseWebSockets(false);

    await expect(sidebarInsert(page)).toContainText(
      "Scan QR code to connect",
      { timeout: 20_000 },
    );
    const phone = await connectPhone(await getConnectUrl(page));
    try {
      await expect(sidebarInsert(page)).toContainText("Connected");

      // Call results are answered with the next contact
      await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
      await phone.page
        .locator("#call-result-links button", { hasText: "Left Voicemail" })
        .click();
      await expect(page.locator("#contactName")).toHaveText(SECOND_CONTACT);
      await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT, {
        timeout: 8_000,
      });
    } finally {
      await phone.browser.close();
    }
  } finally {
    await context.close();
    proxy.close();
  }
});
