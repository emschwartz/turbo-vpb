import { chromium, BrowserContext } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The dev build, which includes http://localhost/* in content_scripts.
export const EXTENSION_PATH = path.resolve(
  __dirname,
  "../../../extension/.output/chrome-mv3-dev",
);

// Launches Chrome with the extension loaded and a fresh profile. Headless by
// default, so test runs don't open windows or steal focus; `HEADED=1` shows
// the browser. `channel: "chromium"` selects the new headless mode, which
// (unlike the old headless shell) supports extensions.
export function launchExtensionContext(
  opts: { extensionPath?: string } = {},
): Promise<BrowserContext> {
  const extensionPath = opts.extensionPath ?? EXTENSION_PATH;
  return chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: process.env.HEADED !== "1",
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--no-first-run",
      "--disable-gpu",
      "--no-default-browser-check",
    ],
  });
}
