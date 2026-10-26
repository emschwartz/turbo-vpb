import { Signal, signal, effect } from "@preact/signals";
import { browser } from "wxt/browser";

export type StoredSignal<T> = Signal<T> & {
  loaded: Promise<void>;
  saved: Promise<void>;
};

/**
 * A signal whose value is persisted to browser.storage.session via the
 * background script. Uses message passing so it works in both Chrome and
 * Firefox content scripts (Firefox doesn't support setAccessLevel, so
 * content scripts can't access storage.session directly).
 *
 * The returned signal has a `loaded` property: a Promise that resolves once
 * the initial value has been read from storage. Await it before using the
 * value if you need the persisted state (e.g., before reconnecting).
 * Its `saved` property is a Promise that resolves once the latest value has
 * been written (or failed to be written) to storage.
 *
 * @param storageKey - The storage key to store the value under.
 * @param defaultValue - The default value to use if the key is not found in storage.
 */
export function sessionStoredSignal<T>(
  storageKey: string,
  defaultValue: T,
): StoredSignal<T> {
  const s = signal(defaultValue) as StoredSignal<T>;

  // Load the previous value from storage.session via the background script.
  s.loaded = browser.runtime
    .sendMessage({ type: "sessionStorage.get", key: storageKey })
    .then((result: Record<string, unknown>) => {
      if (result?.[storageKey] != null) {
        s.value = result[storageKey] as T;
      }
    })
    .catch((err: unknown) => {
      console.error(
        "Error loading value from storage.session:",
        storageKey,
        err,
      );
    });

  // Save the value when it changes.
  s.saved = Promise.resolve();
  effect(() => {
    if (s.value != null) {
      s.saved = browser.runtime
        .sendMessage({
          type: "sessionStorage.set",
          data: { [storageKey]: s.value },
        })
        .catch((err: unknown) => {
          console.error("Error saving to storage.session:", storageKey, err);
        });
    }
  });

  return s;
}
