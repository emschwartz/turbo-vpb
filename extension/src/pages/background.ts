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
  console.log("Permissions added", changes);
  if (changes.origins) {
    await browser.contentScripts.register({
      js: [{ file: contentScript }],
      css: [{ file: css }],
      excludeMatches: SHARE_ORIGINS,
      matches: changes.origins,
    });

    const tabs = await browser.tabs.query({});
    console.log("Injecting into tabs", tabs);
    await injectIntoExistingTabs(tabs);

    console.log("Registered content scripts for origins:", changes.origins);
  }
});

// Also inject the script when new tabs are created/updated
browser.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
  console.log("Tab updated", tab.id, tab.url);
  injectIntoExistingTabs([tab]);
});

async function injectIntoExistingTabs(tabs: Tabs.Tab[]) {
  console.log(await browser.permissions.getAll());
  for (const tab of tabs) {
    // Don't inject into TurboVPB share pages
    if (!tab.id || tab.url?.includes("/share")) {
      continue;
    }

    try {
      await Promise.all([
        browser.tabs.insertCSS(tab.id, {
          file: css,
        }),
        browser.tabs.executeScript(tab.id, {
          file: contentScript,
        }),
      ]);

      console.log("Injected content script into tab:", tab.id, tab.url);
    } catch (err) {
      console.error(
        "Failed to inject content script into tab:",
        tab.id,
        tab.url,
        err
      );
    }
  }
}
