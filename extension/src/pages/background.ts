import { browser, Tabs } from "webextension-polyfill-ts";
import "content-scripts-register-polyfill";

const SHARE_ORIGINS = [
  "https://turbovpb.com/share*",
  "https://*.turbovpb.com/share*",
];
const contentScript = new URL(
  "./content-script/index.tsx",
  import.meta.url
).pathname.slice(1);
const css = new URL("../index.css", import.meta.url).pathname.slice(1);

// Inject scripts when permissions are changed
browser.permissions.onAdded.addListener(async (changes) => {
  if (changes.origins) {
    await browser.contentScripts.register({
      js: [{ file: contentScript }],
      css: [{ file: css }],
      excludeMatches: SHARE_ORIGINS,
      matches: changes.origins,
    });

    const tabs = await browser.tabs.query({ url: changes.origins });
    await injectIntoExistingTabs(tabs);

    console.log("Registered content scripts for origins:", changes.origins);
  }
});

// Also inject the script when new tabs are created/updated
browser.tabs.onUpdated.addListener(async (_tabId, _changeInfo, tab) => {
  if (tab.url) {
    await injectIntoExistingTabs([tab]);
    console.log("Injected content script into tab:", tab.url);
  }
});

async function injectIntoExistingTabs(tabs: Tabs.Tab[]) {
  for (const tab of tabs) {
    if (tab.id) {
      // Don't inject into TurboVPB share pages
      if (tab.url.includes("/share")) {
        return;
      }

      await browser.tabs.executeScript(tab.id, {
        file: contentScript,
      });
      await browser.tabs.insertCSS(tab.id, {
        file: css,
      });
    }
  }
}
