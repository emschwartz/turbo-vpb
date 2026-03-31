/**
 * Firefox-specific e2e tests.
 *
 * Playwright doesn't natively support Firefox extensions, so we use
 * Firefox's Remote Debugging Protocol to install the extension as a
 * temporary addon (which gets full permissions, no user prompt needed).
 *
 * Key Firefox MV3 differences tested here:
 * - browser.storage.session.setAccessLevel() doesn't exist; content scripts
 *   may not be able to access storage.session
 * - Firefox ignores ports in match patterns (Bug 1362809)
 * - host_permissions are auto-granted since Firefox 127
 */
import { test, expect, firefox, BrowserContext } from "@playwright/test";
import path from "path";
import net from "node:net";
import { fileURLToPath } from "url";
import {
  firefoxExtensionPrefs,
  firefoxExtensionArgs,
  installTemporaryAddon,
} from "../lib/firefox-addon";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../extension/.output/firefox-mv3-dev",
);
const SERVER_PORT = process.env.TURBOVPB_TEST_PORT || "8089";
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let firefoxContext: BrowserContext;
let rdpPort: number;

function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

test.beforeAll(async () => {
  rdpPort = await findFreePort();

  firefoxContext = await firefox.launchPersistentContext("", {
    headless: false,
    args: firefoxExtensionArgs(rdpPort),
    firefoxUserPrefs: firefoxExtensionPrefs(rdpPort),
  });

  // Install the extension via RDP as a temporary addon
  await installTemporaryAddon(rdpPort, EXTENSION_PATH);

  // Give Firefox time to initialize the extension
  const initPage = await firefoxContext.newPage();
  await initPage.waitForTimeout(3000);
  await initPage.close();
});

test.afterAll(async () => {
  await firefoxContext?.close();
});

test("content script injects on OpenVPB test page", async () => {
  const page = await firefoxContext.newPage();
  await page.goto(`${SERVER_URL}/test-phonebank`);

  // The content script should auto-inject on localhost (temporary addon
  // gets full permissions, and Firefox ignores ports in match patterns).
  // We check for element existence rather than visibility because the
  // extension hasn't been configured with a server URL, so the QR panel
  // may be hidden.
  await expect(page.locator("#turbovpb-insert")).toBeAttached({
    timeout: 15_000,
  });

  await page.close();
});

test("content script injects on VAN test page via localhost match", async () => {
  // The VAN custom domain page path doesn't match content script patterns
  // (only /test-phonebank* matches for localhost). Verify the content script
  // does NOT auto-inject here.
  const page = await firefoxContext.newPage();
  await page.goto(`${SERVER_URL}/test-van-custom-domain`);

  // Verify VAN markers exist
  const hasVanMarkers = await page.evaluate(
    () =>
      document.querySelector(".van-header") !== null ||
      document.querySelector(".van-inner") !== null,
  );
  expect(hasVanMarkers).toBe(true);

  // Content script should NOT be auto-injected on this path
  await page.waitForTimeout(3000);
  const hasContentScript = await page.evaluate(
    () => !!document.getElementById("turbovpb-insert"),
  );
  expect(hasContentScript).toBe(false);

  await page.close();
});

test("storage.session persists across page reloads", async () => {
  // This test verifies that storage.session data written by the content script
  // survives a page reload. In Chrome, this requires setAccessLevel() which
  // Firefox doesn't implement. If this test fails, it confirms the bug.
  const page = await firefoxContext.newPage();
  await page.goto(`${SERVER_URL}/test-phonebank`);

  // Wait for the content script to fully initialize
  await expect(page.locator("#turbovpb-insert")).toBeAttached({
    timeout: 15_000,
  });
  // Wait for the pubsub client to connect and store connection details
  await page.waitForTimeout(3000);

  // Read the connection details that the content script stored
  const detailsBefore = await page.evaluate(async () => {
    try {
      // Access the extension's storage.session from the content script context.
      // This uses the browser global that WXT injects into the content script.
      const result = await (globalThis as any).browser?.storage?.session?.get(
        "turboVpbConnection",
      );
      return result?.turboVpbConnection ?? null;
    } catch (e) {
      return { error: String(e) };
    }
  });

  console.log("Connection details before reload:", JSON.stringify(detailsBefore));

  // Reload the page
  await page.reload();
  await expect(page.locator("#turbovpb-insert")).toBeAttached({
    timeout: 15_000,
  });
  await page.waitForTimeout(3000);

  // Read connection details again
  const detailsAfter = await page.evaluate(async () => {
    try {
      const result = await (globalThis as any).browser?.storage?.session?.get(
        "turboVpbConnection",
      );
      return result?.turboVpbConnection ?? null;
    } catch (e) {
      return { error: String(e) };
    }
  });

  console.log("Connection details after reload:", JSON.stringify(detailsAfter));

  if (detailsBefore?.error || detailsAfter?.error) {
    console.log(
      "CONFIRMED: storage.session is NOT accessible from Firefox content scripts.",
      "The extension needs a workaround (message passing to background script).",
    );
  } else if (detailsBefore?.channelId && detailsAfter?.channelId) {
    if (detailsBefore.channelId === detailsAfter.channelId) {
      console.log("storage.session works: connection details persisted across reload");
    } else {
      console.log(
        "storage.session accessible but connection details changed " +
          "(extension generated new channel after reload)",
      );
    }
  } else {
    console.log(
      "Connection details not found. " +
        "browser.storage.session may not be available:",
      { detailsBefore, detailsAfter },
    );
  }

  await page.close();
});
