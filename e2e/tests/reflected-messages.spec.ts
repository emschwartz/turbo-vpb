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

// Both sides encrypt with one shared key, and the relay accepts a message for
// either side from anyone who knows the channel id (it is in the connect
// URL). Each message is bound to its sender, so posting one back to the side
// that sent it must not decrypt there. These tests also cover the connect
// page still pairing with extensions older than 0.12, which do not bind
// their messages.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/chrome-mv3-dev",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let extensionContext: BrowserContext;
// A plain page on the server, from which the test acts as an attacker who
// knows the channel id but not the key
let attacker: Browser;
let attackerPage: Page;

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

  attacker = await chromium.launch();
  attackerPage = await attacker.newPage();
  await attackerPage.goto(`${SERVER_URL}/api/status`);
});

test.afterAll(async () => {
  await attacker?.close();
  await extensionContext?.close();
});

function sidebarInsert(page: Page) {
  return page.locator("#turbovpb-insert");
}

// The dialog wrapper itself has no box (its children are position: fixed),
// so check visibility on the modal's content
function qrModalContent(page: Page) {
  return page.locator('#turbovpb-insert [role="dialog"] h2');
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

function withVersion(connectUrl: string, version: string): string {
  const url = new URL(connectUrl);
  url.searchParams.set("version", version);
  return url.toString();
}

/**
 * Connect to the channel as `from` (the server replays the other side's last
 * message to it), and post that message back to the channel as if `from`
 * sent it. The socket is held open for `holdMs`, so the side under attack
 * sees its peer as present. Resolves to whether there was a message to
 * reflect.
 */
async function reflectLastMessage(
  channelId: string,
  from: "extension" | "browser",
  holdMs: number,
): Promise<boolean> {
  return attackerPage.evaluate(
    async ({ serverUrl, channelId, from, holdMs }) => {
      const path = `/api/channels/${channelId}/${from}`;
      const ws = new WebSocket(`${serverUrl.replace("http", "ws")}${path}`);
      ws.binaryType = "arraybuffer";
      const captured = await new Promise<ArrayBuffer | null>((resolve) => {
        ws.onmessage = ({ data }) => {
          if (typeof data !== "string") resolve(data);
        };
        setTimeout(() => resolve(null), 5_000);
      });
      if (captured) {
        await fetch(`${serverUrl}${path}`, { method: "POST", body: captured });
      }
      await new Promise((resolve) => setTimeout(resolve, holdMs));
      ws.close();
      return captured !== null;
    },
    { serverUrl: SERVER_URL, channelId, from, holdMs },
  );
}

async function openPhone(connectUrl: string) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(connectUrl);
  return { browser, page };
}

test("extension ignores its own message posted back to it as the phone's", async () => {
  const phonebankPage = await extensionContext.newPage();
  await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
  await expect(qrModalContent(phonebankPage)).toBeVisible({ timeout: 15_000 });
  const channelId = channelIdFromConnectUrl(await getConnectUrl(phonebankPage));

  const reflecting = reflectLastMessage(channelId, "browser", 4_000);
  // The extension would take the reflected message as the phone pairing:
  // the QR code would close and the sidebar would show it as connected
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    await expect(qrModalContent(phonebankPage)).toBeVisible({ timeout: 100 });
    await expect(sidebarInsert(phonebankPage)).not.toContainText("Connected", {
      timeout: 100,
    });
    await phonebankPage.waitForTimeout(250);
  }
  expect(await reflecting).toBe(true);
  await phonebankPage.close();
});

test("phone ignores its own message posted back to it as the extension's", async () => {
  // No extension on this channel: the only message the phone could get is
  // its own connect message, reflected
  const phonebankPage = await extensionContext.newPage();
  await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
  const connectUrl = await getConnectUrl(phonebankPage);
  await phonebankPage.close();
  const channelId = channelIdFromConnectUrl(connectUrl);

  const phone = await openPhone(connectUrl);
  try {
    // Wait for the phone's connect message to be stored on the server
    await phone.page.waitForTimeout(1_000);
    const reflecting = reflectLastMessage(channelId, "extension", 4_000);
    const status = phone.page.locator("#status");
    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      await expect(status).not.toHaveText("Connected", { timeout: 100 });
      await phone.page.waitForTimeout(250);
    }
    expect(await reflecting).toBe(true);
  } finally {
    await phone.browser.close();
  }
});

test("connect page pairs with an extension older than 0.12 using unbound messages", async () => {
  const phonebankPage = await extensionContext.newPage();
  await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
  const connectUrl = withVersion(await getConnectUrl(phonebankPage), "0.11.5");

  // The extension under test accepts unbound messages too, as from a
  // self-hosted server's older connect page, so it pairs
  const phone = await openPhone(connectUrl);
  try {
    await expect(phone.page.locator("#status")).toHaveText("Connected", {
      timeout: 15_000,
    });
    await expect(phone.page.locator("#name")).toHaveText("Alice Johnson");
    await expect(sidebarInsert(phonebankPage)).toContainText("Connected");
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});
