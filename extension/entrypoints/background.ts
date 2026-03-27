import { browser } from 'wxt/browser';

export default defineBackground({
  type: 'module',
  main() {
    // Allow content scripts to access browser.storage.session
    // (by default, only the background script can access it)
    if (browser.storage.session?.setAccessLevel) {
      browser.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })
        .catch((err) => console.error('Failed to set storage.session access level:', err));
    }

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
          // Check if content script is already injected
          const [result] = await browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => !!document.getElementById('turbovpb-insert'),
          });
          if (result?.result) {
            console.log('Content script already injected in tab:', tab.id);
            continue;
          }

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
