import { signal, effect } from "@preact/signals";

/**
 * A signal whose value is loaded from sessionStorage and automatically saved when it changes.
 *
 * @param sessionStorageKey - The session storage key to store the value under.
 * @param defaultValue - The default value to use if the key is not found in session storage.
 * @returns
 */
export const sessionStoredSignal = <T>(
  sessionStorageKey: string,
  defaultValue: T
) => {
  // Load the previous value from storage
  let previous: T;
  try {
    previous = JSON.parse(sessionStorage.getItem(sessionStorageKey));
  } catch (err) {
    console.error(
      "Error loading value from session storage:",
      sessionStorageKey,
      err
    );
  }

  const s = signal(previous || defaultValue);

  // Save the value when it changes
  effect(() => {
    if (s.value) {
      window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(s.value));
    }
  });

  return s;
};
