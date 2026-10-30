/**
 * Whether a custom server URL may be used. The connect URL, with the
 * encryption key in its fragment, is built from it, and the server's pages
 * decrypt the contacts, so it has to be https, except for a local server
 * during development.
 */
export function isAllowedServerUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" && parsed.hostname === "localhost")
  );
}
