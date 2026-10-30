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

// The extension and the connect page are never updated together, so each
// side must ignore message types and fields it doesn't know, which a newer
// peer will send. Each test posts such a message to one side, as the other
// side, and checks the receiver keeps working afterwards.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/chrome-mv3-dev",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

const FIRST_CONTACT = "Alice Johnson";
const SECOND_CONTACT = "Bob Smith";
const FIRST_CONTACT_PHONE = "(555)-123-4567";

type Sender = "extension" | "browser";

let extensionContext: BrowserContext;

// The first-load wait in openPhonebank can exceed the default test timeout
test.describe.configure({ mode: "serial", timeout: 90_000 });

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
  // The first page in a fresh browser shows the connect link only after
  // its session reads through the background script, which take over 10 s
  // on a busy machine (see qr-modal.spec.ts)
  await expect(
    page.locator('#turbovpb-insert a[href*="/connect"]').first(),
  ).toBeAttached({ timeout: 60_000 });
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

/**
 * Post a message to the channel, encrypted with the key from the connect URL
 * and bound to `from` (the side it pretends to come from; the relay delivers
 * it to the other side).
 */
async function post(connectUrl: string, from: Sender, message: unknown) {
  const [channelId, key] = new URL(connectUrl).hash.slice(1).split("&");
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    Buffer.from(key, "base64url"),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(from) },
      cryptoKey,
      new TextEncoder().encode(JSON.stringify(message)),
    ),
  );
  const body = new Uint8Array(ciphertext.length + iv.length);
  body.set(ciphertext);
  body.set(iv, ciphertext.length);
  const response = await fetch(
    `${SERVER_URL}/api/channels/${channelId}/${from}`,
    { method: "POST", body },
  );
  expect(response.ok).toBe(true);
}

async function expectExtensionConnected(phonebankPage: Page) {
  await expect(phonebankPage.locator("#turbovpb-insert")).toContainText(
    "Connected",
  );
}

test("extension ignores a message type and fields it doesn't know", async () => {
  const phonebankPage = await openPhonebank("household");
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

    await post(connectUrl, "browser", {
      type: "somethingFromANewerConnectPage",
      seq: 12345,
      timestamp: new Date().toISOString(),
      payload: { nested: [1, 2, { three: 3 }] },
      flag: true,
    });
    // Give the extension time to take the message in
    await phonebankPage.waitForTimeout(1_000);
    await expectExtensionConnected(phonebankPage);

    // A real result from the phone is still applied
    await tapCallResult(phone.page, "Left Voicemail");
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      SECOND_CONTACT,
    );
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);
    await expectExtensionConnected(phonebankPage);
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});

test("extension applies a call result that has fields it doesn't know", async () => {
  const phonebankPage = await openPhonebank("household");
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

    await post(connectUrl, "browser", {
      type: "callResult",
      result: "Left Voicemail",
      phoneNumber: FIRST_CONTACT_PHONE,
      seq: 9001,
      timestamp: new Date().toISOString(),
      callNumber: 1,
      notes: "added by a newer connect page",
      durationMs: 4200,
      extra: { nested: ["a", "b"] },
    });

    await expect(phonebankPage.locator("#contactName")).toHaveText(
      SECOND_CONTACT,
    );
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);
    await expectExtensionConnected(phonebankPage);
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});

test("phone ignores a message type it doesn't know", async () => {
  const phonebankPage = await openPhonebank("household");
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

    await post(connectUrl, "extension", {
      type: "somethingFromANewerExtension",
      thing: { nested: [1, 2, 3] },
    });
    await phone.page.waitForTimeout(1_000);

    await expect(phone.page.locator("#status")).toHaveText("Connected");
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    await expect(phone.page.locator("#contact-details")).toBeVisible();

    // Results still go through
    await tapCallResult(phone.page, "Left Voicemail");
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);
    await expect(phone.page.locator("#status")).toHaveText("Connected");
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});

test("phone shows a contact that has fields it doesn't know", async () => {
  const phonebankPage = await openPhonebank("household");
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

    await post(connectUrl, "extension", {
      type: "contact",
      contact: {
        firstName: "Zed",
        lastName: "Zimmer",
        phoneNumber: "(555) 987-6543",
        additionalFields: { City: "Springfield" },
        pronouns: "they/them",
        tags: ["a", "b"],
      },
      stats: {
        startTime: Date.now() - 60_000,
        calls: 3,
        successfulCalls: 1,
        streak: 2,
      },
      yourName: "Pat",
      resultCodes: ["Left Voicemail", "Busy", "Refused"],
      extensionVersion: "99.0.0",
      brandNewTopLevelField: { anything: true },
    });

    await expect(phone.page.locator("#name")).toHaveText("Zed Zimmer");
    await expect(phone.page.locator("#phone-number")).toHaveText(
      "(555) 987-6543",
    );
    await expect(phone.page.locator("#num-calls")).toHaveText("3 Calls");
    await expect(phone.page.locator("#status")).toHaveText("Connected");
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});

test("phone handles a call result response that has fields it doesn't know", async () => {
  const phonebankPage = await openPhonebank("household");
  const connectUrl = await getConnectUrl(phonebankPage);
  const phone = await connectPhone(connectUrl);
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

    // The phone isn't waiting for seq 777, so it ignores the status (as it
    // does for the server's replay of the extension's last response) and
    // still shows the bundled contact
    await post(connectUrl, "extension", {
      type: "callResultResponse",
      seq: 777,
      status: "rejected",
      reason: "aReasonFromANewerExtension",
      phoneNumber: FIRST_CONTACT_PHONE,
      contact: {
        firstName: "Bob",
        lastName: "Smith",
        phoneNumber: "(555)-123-4567",
        pronouns: "he/him",
      },
      stats: { calls: 1, successfulCalls: 0, streak: 1 },
      brandNewTopLevelField: 1,
    });

    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);
    await expect(phone.page.locator("#status")).toHaveText("Connected");
    await expect(phone.page.locator("#snackbar")).not.toContainText(
      "Couldn't save the result",
    );
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});
