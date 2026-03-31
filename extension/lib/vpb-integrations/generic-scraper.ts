const TURBOVPB_CONTAINER_ID = "turbovpb-insert";
const PHONE_CONTEXT_REGEX = /phone|call/i;
const NAME_ELEMENT_SELECTORS = "h1, h2, h3, h4, strong, b";
const NAME_PATTERN = /^[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2}$/;
const MAX_ANCESTOR_LEVELS = 5;

/**
 * Find a phone number on the page by looking for <a href="tel:..."> links.
 * Filters out links inside the TurboVPB extension UI.
 * When multiple links exist, prefers the one nearest to "phone" or "call" text.
 */
export function findPhoneNumber(root: Element): string | undefined {
  const allTelLinks = Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]'),
  );

  const telLinks = allTelLinks.filter(
    (a) => !a.closest(`#${TURBOVPB_CONTAINER_ID}`),
  );

  if (telLinks.length === 0) return undefined;
  if (telLinks.length === 1)
    return telLinks[0].textContent?.trim() || undefined;

  // Multiple tel: links: prefer the one near "phone" or "call" text
  for (const link of telLinks) {
    const parent = link.parentElement;
    if (parent && PHONE_CONTEXT_REGEX.test(parent.textContent ?? "")) {
      return link.textContent?.trim() || undefined;
    }
  }

  // Fall back to the first link
  return telLinks[0].textContent?.trim() || undefined;
}

/**
 * Find a person's name near a phone number element by walking up the DOM
 * and looking for heading or bold elements containing name-like text.
 */
export function findName(
  phoneElement: Element,
): { firstName: string; lastName: string } | undefined {
  let current: Element | null = phoneElement;

  for (let level = 0; level < MAX_ANCESTOR_LEVELS; level++) {
    current = current.parentElement;
    if (!current) break;

    const candidates = current.querySelectorAll(NAME_ELEMENT_SELECTORS);
    for (const candidate of candidates) {
      const text = candidate.textContent?.trim();
      if (!text) continue;
      if (text.length > 50) continue;
      if (/\d/.test(text)) continue;
      if (!NAME_PATTERN.test(text)) continue;

      const parts = text.split(" ");
      return {
        firstName: parts[0],
        lastName: parts.slice(1).join(" "),
      };
    }
  }

  return undefined;
}
