import { default as browser } from 'webextension-polyfill';

browser.runtime.onInstalled.addListener(async () => {
  console.log('Extension installed');

  const origins = browser.runtime.getManifest().host_permissions;

  console.log(await browser.permissions.getAll());

  if (!browser.permissions.contains({origins})) {
    browser.permissions.request({origins});
  }
});
