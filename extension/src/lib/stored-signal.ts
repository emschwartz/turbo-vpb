import { signal, effect } from "@preact/signals";

/**
 * A signal whose value is loaded from sessionStorage and automatically saved when it changes.
 *
 * @param sessionStorageKey - The session storage key to store the value under.
 * @param defaultValue - The default value to use if the key is not found in session storage.
 * @returns
 */
const storedSignal = <T>(sessionStorageKey: string, defaultValue: T) => {
  // Load the previous value from storage
  const previous: T = JSON.parse(
    window.sessionStorage.getItem(sessionStorageKey)
  );

  const s = signal(previous || defaultValue);

  // Save the value when it changes
  effect(() => {
    window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(s.value));
  });

  return s;
};

export default storedSignal;
