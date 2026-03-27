import { browser } from 'wxt/browser';

export default defineBackground({
  type: 'module',
  main() {
    // WXT handles content script registration via the manifest.
    // We only need to handle dynamic injection into already-open tabs
    // when new permissions are granted at runtime.

    browser.permissions.onAdded.addListener(async (changes) => {
      console.log('Permissions added', changes);
      if (!changes.origins) return;

      const tabs = await browser.tabs.query({});
      for (const tab of tabs) {
        if (!tab.id || !tab.url || tab.url.includes('/share')) continue;

        const hasPermission = await browser.permissions.contains({
          origins: [new URL(tab.url).origin + '/*'],
        });
        if (!hasPermission) continue;

        try {
          await browser.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['/content-scripts/content.css'],
          });
          await browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['/content-scripts/content.js'],
          });
          console.log('Injected content script into tab:', tab.id, tab.url);
        } catch (err) {
          console.error(
            'Failed to inject content script into tab:',
            tab.id,
            tab.url,
            err,
          );
        }
      }
    });
  },
});
