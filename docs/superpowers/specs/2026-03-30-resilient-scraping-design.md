# Resilient Scraping with Semantic Fallbacks

## Problem

The extension scrapes contact details from phone bank pages (OpenVPB, EveryAction, BlueVote) using hardcoded CSS selectors and DOM structure assumptions. When platforms update their HTML, the scrapers break silently. There is no automated way to detect breakage; users report it manually.

## Goal

Make contact scraping resilient to HTML changes by adding semantic fallback heuristics that activate when primary selectors fail. Keep the existing architecture. No new external services.

## Priorities

- **Must have:** Phone number and name extraction via fallback
- **Nice to have:** Additional fields via fallback (not in scope for this change)
- **Out of scope:** Result code scraping, button interactions, new platform support, remote selector config

## Design

### Fallback Chain

Each platform scraper's `scrapeContactDetails()` method gains a two-step extraction flow:

1. **Primary:** Try existing platform-specific selectors (current behavior, unchanged)
2. **Fallback:** If primary returns `undefined`, call shared generic extraction

The fallback only attempts phone number and name. If the fallback also fails, the scraper returns `undefined` as it does today.

```
scrapeContactDetails()
  |-- tryPrimarySelectors()  --> ContactDetails | undefined
  |-- genericScraper.scrapeContact(document)  --> { phone, firstName, lastName } | undefined
```

### Generic Scraper (`extension/lib/vpb-integrations/generic-scraper.ts`)

A single shared module with two extraction functions:

**`findPhoneNumber(root: Element): string | undefined`**

1. Query all `<a href="tel:...">` elements within `root`
2. Filter out any elements inside the extension's own injected container (the TurboVPB sidebar)
3. If exactly one remains, return its text content
4. If multiple remain, prefer the one whose closest ancestor contains text matching "phone" or "call" (case-insensitive)
5. If still ambiguous, return the first one

**`findName(phoneElement: Element): { firstName: string; lastName: string } | undefined`**

Starting from the phone number element, search for a nearby name:

1. Walk up from `phoneElement` through ancestor elements (up to 5 levels)
2. At each level, look for child elements that are headings (`h1`-`h4`), `strong`/`b` elements, or elements with a larger computed font size than the phone element
3. For each candidate, check if its `textContent` matches a name-like pattern: 2-3 words, each starting with an uppercase letter, no digits, total length under 50 characters
4. Return the first match, split into firstName (first word) and lastName (remaining words)

These heuristics are deliberately simple. They rely on two assumptions that hold across all three platforms today:
- Phone numbers appear as `tel:` links
- The contact's name is displayed prominently (heading or bold) near the phone number

### Confidence Signal

Add a `confidence` field to the scrape result. This is a simple flag, not a scoring system.

```typescript
// extension/lib/types.ts
type ScrapeConfidence = "high" | "low";

type ContactDetails = {
  phoneNumber: string;
  firstName: string;
  lastName: string;
  additionalFields: { [key: string]: string };
  confidence: ScrapeConfidence;
};
```

- **`"high"`**: Primary platform-specific selectors matched
- **`"low"`**: Fell back to generic heuristics

### Diagnostics Integration

Extend the existing `PageHints` / diagnostics system:

- When the fallback is used, log a console warning: `"TurboVPB: primary selectors failed, using fallback for [platform]"`
- Include `confidence` in the `ScrapingStatus` so the diagnostic clipboard output shows whether the fallback was active
- No new diagnostic infrastructure; this piggybacks on the existing `collectPageHints()` and `buildDiagnosticClipboard()` flow

### UI Indicator

When `confidence === "low"`, show a subtle text note in the TurboVPB sidebar (e.g., "Contact details may be incomplete"). This is informational only, not blocking. The extension continues to function normally.

## Files Changed

| File | Change |
|------|--------|
| `extension/lib/vpb-integrations/generic-scraper.ts` | **New.** Shared `findPhoneNumber()` and `findName()` functions |
| `extension/lib/types.ts` | Add `ScrapeConfidence` type, add `confidence` field to `ContactDetails` |
| `extension/lib/vpb-integrations/openvpb.ts` | Call generic fallback when primary selectors return nothing; set `confidence` |
| `extension/lib/vpb-integrations/everyaction.ts` | Same |
| `extension/lib/vpb-integrations/bluevote.ts` | Same |
| `extension/entrypoints/content/index.tsx` | Pass confidence to UI components |
| `extension/lib/page-hints.ts` | Include confidence/fallback usage in collected hints |

## What Does NOT Change

- Platform detection (URL-based, in `index.ts`)
- Result code scraping and button interactions (platform-specific, stays as-is)
- `VpbIntegration` interface (method signatures unchanged; `ContactDetails` gains a `confidence` field but this is additive and does not break existing consumers)
- WebSocket protocol and server
- Scraping loop timing (MutationObserver + 2s poll)
- `contactsAreEqual()` deduplication logic (still compares phone, firstName, lastName)

## Edge Cases

- **Multiple `tel:` links on page:** The generic scraper filters by proximity to "phone"/"call" text and falls back to the first link. This matches the existing EveryAction behavior which already filters out "designated contact" links.
- **No `tel:` links at all:** Fallback returns `undefined`, same as today's failure mode.
- **Name element not near phone element:** The 5-level ancestor walk may miss it. Acceptable, since primary selectors handle the normal case and this is a best-effort fallback.
- **Extension's own UI contains phone-like text:** Filtered out by excluding elements inside the TurboVPB container.
