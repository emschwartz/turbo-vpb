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
const FIRST_CONTACT_PHONE = "(555)-123-4567";

// The connect page retries a call result 3 times, 3 seconds apart, until the
// extension responds (CALL_RESULT_MAX_RETRIES, CALL_RESULT_ACK_TIMEOUT)
const CALL_RESULT_RETRY_WINDOW_MS = 10_000;

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

test("call result is not applied again to the next household member after a page load", async () => {
  // Like VAN, each contact is a new page load. The new page's content script
  // gets the call result again: the server replays the phone's last message
  // when the extension reconnects, and the phone retries until it gets a
  // response, which the previous page never sent.
  const phonebankPage = await openPhonebank("household&navigate");
  const phone = await connectPhone(await getConnectUrl(phonebankPage));
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    await tapCallResult(phone.page, "Refused");
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      SECOND_CONTACT,
    );
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);

    // Bob shares Alice's phone number, so the phone number check alone
    // can't tell that the result was meant for Alice. He must not be
    // marked (which would skip ahead to Carol) before he is called.
    await phonebankPage.waitForTimeout(CALL_RESULT_RETRY_WINDOW_MS);
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      SECOND_CONTACT,
    );
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);

    // Bob's own result is still recorded
    await tapCallResult(phone.page, "Busy");
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      "Carol Williams",
    );
    await expect(phone.page.locator("#name")).toHaveText("Carol Williams");
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});

test("a retried call result is answered after the first copy is saved, not before", async () => {
  // The phone resends a call result that isn't answered within 3 seconds.
  // When saving the first copy is slow, the retry used to be answered right
  // away as "already marked", bundling the contact that was still on the
  // page, so the phone showed the volunteer the person they had just called
  // as saved and current. The retry must wait for the first copy.
  const phonebankPage = await openPhonebank("household");
  const phone = await connectPhone(await getConnectUrl(phonebankPage));
  const logs: string[] = [];
  phonebankPage.on("console", (message) => logs.push(message.text()));
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

    // Two copies of one result, as sent by the phone and its retry, arriving
    // back to back
    await phonebankPage.evaluate((phoneNumber) => {
      const message = {
        type: "callResult",
        result: "Left Voicemail",
        phoneNumber,
        seq: 9001,
        timestamp: new Date().toISOString(),
      };
      for (let i = 0; i < 2; i++) {
        window.postMessage(
          { type: "turbovpb-test:inject-call-result", message },
          "*",
        );
      }
    }, FIRST_CONTACT_PHONE);

    await expect(phonebankPage.locator("#contactName")).toHaveText(
      SECOND_CONTACT,
    );
    await expect
      .poll(() => logs.some((log) => /already marked/.test(log)), {
        timeout: 10_000,
      })
      .toBe(true);
    const marked = logs.findIndex((log) => /Marking result/.test(log));
    const retryAnswered = logs.findIndex((log) => /already marked/.test(log));
    expect(marked).toBeGreaterThanOrEqual(0);
    expect(retryAnswered).toBeGreaterThan(marked);
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});

test("call result is reported saved, not rejected, when the next contact after a page load has a different number", async () => {
  // Same as above, but Bob has his own number. The result for Alice must
  // still be recognized as already saved (rather than rejected as being for
  // the wrong contact), so the phone isn't told it wasn't saved.
  const phonebankPage = await openPhonebank("navigate");
  const phone = await connectPhone(await getConnectUrl(phonebankPage));
  const rejections: string[] = [];
  phone.page.on("console", (message) => {
    if (/rejected/.test(message.text())) {
      rejections.push(message.text());
    }
  });
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    await tapCallResult(phone.page, "Refused");
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      SECOND_CONTACT,
    );
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);

    await phonebankPage.waitForTimeout(CALL_RESULT_RETRY_WINDOW_MS);
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);
    expect(rejections).toEqual([]);
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});

test("phone is told when a result can't be marked on the phone bank page", async () => {
  const phonebankPage = await openPhonebank("");
  const phone = await connectPhone(await getConnectUrl(phonebankPage));
  try {
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    // e.g. this contact's script doesn't offer that result code
    await phonebankPage.evaluate(() =>
      document.getElementById("busy")!.parentElement!.remove(),
    );

    await tapCallResult(phone.page, "Busy");

    await expect(phone.page.locator("#snackbar")).toContainText(
      "Couldn't save the result on the phone bank page",
    );
    // Nothing was saved, so both sides stay on the same contact for the
    // volunteer to pick another result
    await expect(phone.page.locator("#contact-details")).toBeVisible();
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      FIRST_CONTACT,
    );
    await tapCallResult(phone.page, "Refused");
    await expect(phonebankPage.locator("#contactName")).toHaveText(
      SECOND_CONTACT,
    );
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);
  } finally {
    await phone.browser.close();
    await phonebankPage.close();
  }
});

test("a second phone bank tab gets its own connection instead of sharing the phone", async () => {
  const firstTab = await openPhonebank("");
  const connectUrl = await getConnectUrl(firstTab);
  const phone = await connectPhone(connectUrl);
  const secondTab = await openPhonebank("contact=2");
  try {
    await expect(secondTab.locator("#contactName")).toHaveText(
      "Carol Williams",
    );
    // The second tab has its own QR code, and the phone keeps following
    // the tab it was paired with
    expect(await getConnectUrl(secondTab)).not.toBe(connectUrl);
    await phone.page.waitForTimeout(2_000);
    await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

    await tapCallResult(phone.page, "Busy");
    await expect(firstTab.locator("#contactName")).toHaveText(SECOND_CONTACT);
    await expect(phone.page.locator("#name")).toHaveText(SECOND_CONTACT);
    await phone.page.waitForTimeout(2_000);
    await expect(secondTab.locator("#contactName")).toHaveText(
      "Carol Williams",
    );
  } finally {
    await phone.browser.close();
    await firstTab.close();
    await secondTab.close();
  }
});

test("call results aren't marked against a stale contact after the extension is updated", async () => {
  // Its own browser, since reloading the extension affects every tab
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
  try {
    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }
    await serviceWorker.evaluate(
      (serverUrl) =>
        (globalThis as any).chrome.storage.local.set({ serverUrl }),
      SERVER_URL,
    );
    const phonebankPage = await context.newPage();
    await phonebankPage.goto(`${SERVER_URL}/test-phonebank`);
    const phone = await connectPhone(await getConnectUrl(phonebankPage));
    try {
      await expect(phone.page.locator("#name")).toHaveText(FIRST_CONTACT);

      // The browser updates the extension mid-shift. The content script
      // already running in the tab is cut off from the extension: it stops
      // seeing new contacts on the page and can't save anything.
      await serviceWorker.evaluate(() =>
        (globalThis as any).chrome.runtime.reload(),
      );
      const sidebar = phonebankPage.locator("#turbovpb-insert");
      await expect(sidebar).toContainText("Reload the page", {
        timeout: 10_000,
      });
      await expect(phone.page.locator("#status")).toHaveText(
        "Extension disconnected",
        { timeout: 10_000 },
      );

      // So the volunteer can't tap results that would be marked against
      // whichever contact the page has moved on to
      await expect(phone.page.locator("#contact-details")).toBeHidden();
    } finally {
      await phone.browser.close();
    }
  } finally {
    await context.close();
  }
});
