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
export const sessionStoredSignal = <T>(
  storageKey: string,
  defaultValue: T,
) => {
  const s = signal(defaultValue);

  // Load the previous value from browser.storage.session asynchronously.
  // Fall back to DOM sessionStorage for browsers that don't support storage.session.
  const storageArea = browser.storage.session || null;
  if (storageArea) {
    storageArea.get(storageKey).then((result) => {
      if (result[storageKey] != null) {
        s.value = result[storageKey] as T;
      }
    }).catch((err) => {
      console.error("Error loading value from browser.storage.session:", storageKey, err);
      // Fall back to DOM sessionStorage
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          s.value = JSON.parse(raw) as T;
        }
      } catch (parseErr) {
        console.error("Error loading fallback from sessionStorage:", storageKey, parseErr);
      }
    });
  } else {
    // Fallback for browsers without storage.session support
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        s.value = JSON.parse(raw) as T;
      }
    } catch (err) {
      console.error("Error loading value from session storage:", storageKey, err);
    }
  }

  // Save the value when it changes.
  // Write to both browser.storage.session (survives content script reloads)
  // and DOM sessionStorage (accessible from page context for tests/compat).
  effect(() => {
    if (s.value) {
      if (storageArea) {
        storageArea.set({ [storageKey]: s.value }).catch((err) => {
          console.error("Error saving to browser.storage.session:", storageKey, err);
        });
      }
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(s.value));
      } catch (err) {
        // DOM sessionStorage may be unavailable in some contexts
      }
    }
  });

  return s;
};
