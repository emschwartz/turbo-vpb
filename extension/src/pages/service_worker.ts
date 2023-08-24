import { default as browser, Tabs } from "webextension-polyfill";
import "content-scripts-register-polyfill";

const SHARE_ORIGINS = [
  "https://turbovpb.com/share*",
  "https://*.turbovpb.com/share*",
];

const manifest = browser.runtime.getManifest();
const js = manifest.content_scripts[0].js;
const css = manifest.content_scripts[0].css;

// Inject scripts when permissions are changed
browser.permissions.onAdded.addListener(async (changes) => {
  console.log("Permissions added", changes);
  if (changes.origins) {
    await browser.contentScripts.register({
      js: js.map((file) => ({ file })),
      css: css.map((file) => ({ file })),
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
    if (!tab.id || !tab.url || tab.url?.includes("/share")) {
      continue;
    }

    try {
      await Promise.all([
        browser.scripting.insertCSS({
          target: { tabId: tab.id },
          files: css,
        }),
        browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: js,
        }),
      ]);

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
}
