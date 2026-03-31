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

test("content script survives page reload", async () => {
  // Verifies the content script re-injects and initializes after a page
  // reload. This exercises the storage.session message passing path: the
  // content script uses runtime.sendMessage to proxy session storage through
  // the background script (needed because Firefox content scripts can't
  // access storage.session directly).
  const page = await firefoxContext.newPage();
  await page.goto(`${SERVER_URL}/test-phonebank`);

  await expect(page.locator("#turbovpb-insert")).toBeAttached({
    timeout: 15_000,
  });

  // Reload the page (simulates VoteBuilder's "Save & Next" which reloads)
  await page.reload();

  // Content script should re-inject and initialize without errors
  await expect(page.locator("#turbovpb-insert")).toBeAttached({
    timeout: 15_000,
  });

  // Verify the console has no uncaught errors from the content script
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("TurboVPB")) {
      errors.push(msg.text());
    }
  });
  await page.reload();
  await expect(page.locator("#turbovpb-insert")).toBeAttached({
    timeout: 15_000,
  });
  await page.waitForTimeout(1000);

  // Filter out expected connection errors (no server configured)
  const unexpectedErrors = errors.filter(
    (e) => !e.includes("Failed to connect to server"),
  );
  expect(unexpectedErrors).toEqual([]);

  await page.close();
});
