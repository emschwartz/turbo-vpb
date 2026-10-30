import { browser } from "wxt/browser";
import { MatchPattern } from "wxt/utils/match-patterns";
import { TabSessionStorage } from "../lib/tab-session-storage";

const CONTENT_SCRIPT = "content-scripts/content.js";

/**
 * The pages the main content script is declared for in the manifest. When a
 * site is enabled at runtime, the script is only injected into the open tabs
 * on those pages, where it would have run on its own. Host permissions are
 * not that check: Chrome ignores the path of a host permission, so the
 * `https://*\/ContactDetailScript` permission for VAN's custom domains
 * covers every https origin.
 */
function contentScriptPatterns(): MatchPattern[] {
  const scripts = browser.runtime.getManifest().content_scripts ?? [];
  return scripts
    .filter((script) => script.js?.includes(CONTENT_SCRIPT))
    .flatMap((script) => script.matches ?? [])
    .map((pattern) => new MatchPattern(pattern));
}

export function isContentScriptPage(url: string | undefined): boolean {
  return !!url && contentScriptPatterns().some((p) => p.includes(url));
}

async function injectContentScriptIntoTab(tabId: number): Promise<void> {
  const [result] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => !!document.getElementById("turbovpb-insert"),
  });
  if (result?.result) return;

  await browser.scripting.insertCSS({
    target: { tabId },
    files: ["/content-scripts/content.css"],
  });
  await browser.scripting.executeScript({
    target: { tabId },
    files: [`/${CONTENT_SCRIPT}`],
  });
}

// The origin of the page a content script's message came from. Sessions are
// scoped to it (see TabSessionStorage).
function senderOrigin(sender: { url?: string; origin?: string }): string {
  if (sender.url) {
    try {
      return new URL(sender.url).origin;
    } catch {
      // fall through
    }
  }
  return sender.origin ?? "unknown";
}

export default defineBackground({
  type: "module",
  main() {
    // Proxy storage.session for content scripts via message passing.
    // Content scripts can't access storage.session directly in Firefox
    // (setAccessLevel doesn't exist), so all session storage goes through
    // the background script which has unrestricted access. Each tab and site
    // gets its own session, so two phone bank tabs don't share the phone
    // and a page on another site can't resume a phone bank's session.
    const sessionStorage = new TabSessionStorage(
      browser.storage.session,
      async (tabId) => {
        try {
          await browser.tabs.get(tabId);
          return true;
        } catch {
          return false;
        }
      },
    );
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (sender.id !== browser.runtime.id) {
        return;
      }
      if (message?.type === "sessionStorage.get") {
        const tabId = sender.tab?.id;
        (tabId === undefined
          ? browser.storage.session.get(message.key)
          : sessionStorage.get(tabId, senderOrigin(sender), message.key)
        )
          .then(sendResponse)
          .catch((err) => {
            console.error("sessionStorage.get error:", err);
            sendResponse({});
          });
        return true; // async response
      }
      if (message?.type === "storage.local.set") {
        browser.storage.local
          .set(message.data)
          .then(() => sendResponse(true))
          .catch((err) => {
            console.error("storage.local.set error:", err);
            sendResponse(false);
          });
        return true;
      }
      // Only the E2E tests ask for this (through the dev-only postMessage
      // bridge in the content script), to put the script on test pages the
      // manifest doesn't list. Production builds don't have the handler at
      // all, so nothing in them can inject the script on request.
      if (import.meta.env.DEV && message?.type === "injectContentScript") {
        (async () => {
          try {
            const tabs = await browser.tabs.query({
              url: message.urlPattern || "http://localhost/*",
            });
            for (const tab of tabs) {
              if (tab.id !== undefined)
                await injectContentScriptIntoTab(tab.id);
            }
            sendResponse(true);
          } catch (err) {
            console.error("injectContentScript error:", err);
            sendResponse(false);
          }
        })();
        return true;
      }
      if (message?.type === "openOptions") {
        // Content scripts can't open the options page themselves
        browser.runtime
          .openOptionsPage()
          .then(() => sendResponse(true))
          .catch((err) => {
            console.error("openOptionsPage error:", err);
            sendResponse(false);
          });
        return true;
      }
      if (message?.type === "sessionStorage.set") {
        const tabId = sender.tab?.id;
        (tabId === undefined
          ? browser.storage.session.set(message.data)
          : sessionStorage.set(tabId, senderOrigin(sender), message.data)
        )
          .then(() => sendResponse(true))
          .catch((err) => {
            console.error("sessionStorage.set error:", err);
            sendResponse(false);
          });
        return true;
      }
    });

    // WXT handles content script registration via the manifest.
    // We only need to handle dynamic injection into already-open tabs
    // when new permissions are granted at runtime (the popup's "Enable on
    // this site" button for a VAN custom domain).

    browser.permissions.onAdded.addListener(async (changes) => {
      console.log("Permissions added", changes);
      if (!changes.origins) return;

      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id || !isContentScriptPage(tab.url)) continue;

        const hasPermission = await browser.permissions.contains({
          origins: [new URL(tab.url!).origin + "/*"],
        });
        if (!hasPermission) continue;

        try {
          await injectContentScriptIntoTab(tab.id);
          console.log("Injected content script into tab:", tab.id, tab.url);
        } catch (err) {
          console.error(
            "Failed to inject content script into tab:",
            tab.id,
            tab.url,
            err,
          );
        }
      }
    });
  },
});
