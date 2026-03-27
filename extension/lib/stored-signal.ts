import { signal, effect } from "@preact/signals";
import { browser } from "wxt/browser";

/**
 * A signal whose value is persisted to browser.storage.session (MV3 extension session storage).
 * Unlike DOM sessionStorage, this survives content script reloads within the same browser session.
 *
 * @param storageKey - The storage key to store the value under.
 * @param defaultValue - The default value to use if the key is not found in storage.
 * @returns
 */
export const sessionStoredSignal = <T>(storageKey: string, defaultValue: T) => {
  const s = signal(defaultValue);

  // Load the previous value from browser.storage.session asynchronously.
  const storageArea = browser.storage.session || null;
  if (storageArea) {
    storageArea
      .get(storageKey)
      .then((result) => {
        if (result[storageKey] != null) {
          s.value = result[storageKey] as T;
        }
      })
      .catch((err) => {
        console.error(
          "Error loading value from browser.storage.session:",
          storageKey,
          err,
        );
      });
  }

  // Save the value when it changes.
  effect(() => {
    if (s.value != null) {
      if (storageArea) {
        storageArea.set({ [storageKey]: s.value }).catch((err) => {
          console.error(
            "Error saving to browser.storage.session:",
            storageKey,
            err,
          );
        });
      }
    }
  });

  return s;
};
