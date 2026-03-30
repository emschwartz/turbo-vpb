# Connection Status Errors and Diagnostics

## Problem

The TurboVPB extension gets stuck on "Connecting to server..." with no timeout and no diagnostic information. Users cannot tell whether the problem is:
- The relay server is unreachable
- The mobile browser never connected
- The VPB platform changed its page layout and contact scraping is failing

There is no way for users to report issues with enough detail for the developer to diagnose the problem.

## Solution

Replace the single `ConnectionStatus` enum with three independent status signals, add timeouts, and provide actionable error UI with a "Report issue" mailto: link that includes diagnostic details.

## State Model

Three independent Preact signals replace the current `ConnectionStatus`:

### ServerStatus (WebSocket connection to relay server)

```typescript
type ServerStatus =
  | { state: "connecting" }
  | { state: "connected" }
  | { state: "error"; error: string };
```

- Initial state: `"connecting"`
- Transitions to `"connected"` when WebSocket `open` event fires
- Transitions to `"error"` after **15 seconds** if the WebSocket has not successfully opened
- On reconnect (after disconnect), resets to `"connecting"` and the 15s timer restarts
- Error string captures the reason (e.g. "WebSocket timed out after 15s", "WebSocket closed before connecting")

### PeerStatus (mobile browser connection)

```typescript
type PeerStatus =
  | { state: "waiting" }
  | { state: "connected" };
```

- Initial state: `"waiting"`
- Transitions to `"connected"` when a message is received from the mobile browser
- Transitions to `"waiting"` when a `peerDisconnected`/`peerClosed` control message is received
- Resets to `"waiting"` when the server reconnects after a disconnect

### ScrapingStatus (contact detail extraction)

```typescript
type ScrapingStatus =
  | { state: "searching" }
  | { state: "found" }
  | { state: "not_found"; platform: PhonebankType; pageHints: PageHints };
```

- Initial state: `"searching"`
- Transitions to `"found"` when `scrapeContactDetails()` returns a contact
- Transitions to `"not_found"` after **10 seconds** if no contact has been found
- Resets to `"found"` if a contact is subsequently detected (the MutationObserver and polling continue running after the timeout)
- `pageHints` captures diagnostic information about the page for bug reports

### PageHints

```typescript
type PageHints = {
  url: string;
  bodyClasses: string;
  elementIds: string[];
  selectorsExpected: string[];
  phoneNumberLocations: PhoneNumberLocation[];
  htmlStructure: string;
};

type PhoneNumberLocation = {
  number: string;        // The matched phone number text
  domPath: string;       // Ancestor chain, e.g. "body > div.grid-half > a[href='tel:...']"
};
```

- `url`: Current page URL
- `bodyClasses`: `document.body.className` to identify the page layout
- `elementIds`: First ~20 element IDs found on the page via `document.querySelectorAll('[id]')`
- `selectorsExpected`: The CSS selectors the scraper tried (from the integration's `expectedSelectors()` method)
- `phoneNumberLocations`: All phone number patterns found on the page (via regex like `\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}`) with their DOM ancestor path (tag + id + class, no text content)
- `htmlStructure`: Simplified outline of the content area's DOM tree (tag names, IDs, and classes only, no text content to avoid PII)

## UI Components

### Connection Status Badge (refactored)

The existing `ConnectionStatusBadge` is refactored to accept the three status signals and display based on priority:

| Priority | Condition | Badge | Color |
|----------|-----------|-------|-------|
| 1 | `serverStatus.state === "error"` | "Could not connect to server" with Details, Retry, Report links | Red (bg-red-100) |
| 2 | `serverStatus.state === "connecting"` | "Connecting to server..." | Gray (bg-slate-100) |
| 3 | `peerStatus.state === "waiting"` | "Scan QR code to connect" | Blue (bg-blue-100) |
| 4 | `peerStatus.state === "connected"` | "Connected" | Green (bg-green-100) |

When the badge has a "Details" toggle, clicking it expands an `ErrorDetailPanel` below showing the technical error string in a monospace box.

"Retry" resets `serverStatus` to `"connecting"` and triggers a fresh WebSocket connection.

"Report issue" opens a pre-filled mailto: link.

### Scraping Warning (new component)

Only renders when `scrapingStatus.state === "not_found"`. Displayed below the connection status badge as an amber warning box:

- Warning icon + "Could not find contact details on this page"
- "The [platform name] page layout may have changed."
- Expandable "Details" showing the page hints (selectors expected vs. element IDs found)
- "Report issue" mailto: link with diagnostic details

### Error Detail Panel (new shared component)

A small expandable panel used by both the connection error badge and the scraping warning. Shows technical details in a monospace font. Toggled by a "Details" link.

## Report Issue Flow

Clicking "Report issue" performs two actions:

1. **Copies full diagnostics to clipboard** (no character limit concerns)
2. **Opens a mailto: link** with a short body prompting the user to paste

### mailto: link

- **To:** evan@turbovpb.com
- **Subject:** TurboVPB Issue Report
- **Body:**

```
Hi Evan,

I ran into a problem while using TurboVPB.

Please paste the diagnostic details from your clipboard below (they were
copied automatically when you clicked "Report issue"):

[PASTE HERE]

Please also describe what happened in as much detail as possible, including
any other details that might help figure out what's wrong:


```

### Clipboard contents

The full diagnostic payload copied to clipboard, with no length constraints:

```
--- TurboVPB Diagnostic Details ---
Platform: [EveryAction|OpenVPB|BlueVote]
Page URL: [current URL]
Server status: [state] [error detail if any]
Peer status: [state]
Contact scraping: [state]
Extension version: [from manifest]
Browser: [navigator.userAgent]

--- Selectors Expected ---
[list from integration's expectedSelectors()]

--- Phone Numbers Found on Page ---
[number] at [domPath]
[number] at [domPath]

--- Page Element IDs ---
[first ~20 IDs found on page]

--- Body Classes ---
[document.body.className]

--- HTML Structure (content area) ---
[simplified DOM tree: tag names + IDs + classes, no text content]
```

A shared `buildDiagnosticClipboard()` function constructs the clipboard text, and `buildReportIssueMailto()` constructs the mailto: URL. Both live in a new `extension/lib/diagnostics.ts` module so they can be used by the connection error badge and the scraping warning.

## Integration Interface Changes

Add `expectedSelectors()` to the VPB integration interface:

```typescript
interface VpbIntegration {
  type: PhonebankType;
  scrapeContactDetails: () => ContactDetails | undefined;
  scrapeResultCodes: () => Promise<string[] | undefined>;
  markResult: (resultCode: string) => Promise<void>;
  onCallResult: (callback: (contacted: boolean, result?: string) => void | Promise<void>) => void;
  turboVpbContainerLocation: () => HTMLElement | undefined;
  expectedSelectors: () => string[];  // NEW
}
```

Each integration returns the CSS selectors it tries when scraping. For example, EveryAction returns:
```typescript
["#current-number", 'a[href^="tel:"]', ".person-phone-panel", "#spanTableAdditionalInfo"]
```

This is included in `PageHints.selectorsExpected` for diagnostic reports.

## Files to Modify

1. **`extension/lib/types.ts`** - Replace `ConnectionStatus` with `ServerStatus`, `PeerStatus`, `ScrapingStatus`, `PageHints`, `PhoneNumberLocation`
2. **`extension/entrypoints/content/state.ts`** - Replace `status` signal with `serverStatus`, `peerStatus`, `scrapingStatus`. Add timeout logic. Update `isConnectedToServer` and other computed signals.
3. **`extension/entrypoints/content/index.tsx`** - Update `connectPubsubClient` to set server/peer status separately. Update `watchForNewContacts` to track scraping timeout with page hints.
4. **`extension/components/connection-status-badge.tsx`** - Refactor to derive display from three signals with priority logic.
5. **`extension/components/scraping-warning.tsx`** (new) - Amber warning for scraping failures.
6. **`extension/components/error-detail-panel.tsx`** (new) - Shared expandable detail panel.
7. **`extension/lib/vpb-integrations/index.ts`** - Add `expectedSelectors` to the integration interface.
8. **`extension/lib/vpb-integrations/everyaction.ts`** - Implement `expectedSelectors()`.
9. **`extension/lib/vpb-integrations/openvpb.ts`** - Implement `expectedSelectors()`.
10. **`extension/lib/vpb-integrations/bluevote.ts`** - Implement `expectedSelectors()`.
11. **`extension/lib/page-hints.ts`** (new) - `collectPageHints()` function that gathers element IDs, body classes, phone number locations (regex scan + DOM ancestor paths), and simplified HTML structure of the content area.
12. **`extension/lib/diagnostics.ts`** (new) - `buildDiagnosticClipboard()` for full diagnostic text, `buildReportIssueMailto()` for the mailto: URL. Shared by connection error badge and scraping warning.
13. **`extension/components/qr-code-insert.tsx`** - Update to use new status signals.
14. **`extension/components/qr-code-modal.tsx`** - Update to use new status signals.

## New Test Files

15. **`extension/lib/__tests__/page-hints.test.ts`** - Tests for `collectPageHints()` with mocked DOM: phone number regex scanning, DOM path construction, HTML structure generation, element ID collection.
16. **`extension/lib/__tests__/diagnostics.test.ts`** - Tests for clipboard text and mailto URL construction across status combinations.
17. **`extension/components/__tests__/connection-status-badge.test.tsx`** - Badge renders correct text/color for each status priority.
18. **`extension/components/__tests__/scraping-warning.test.tsx`** - Warning display, detail expansion, report link.

## Timeouts

| What | Timeout | Behavior |
|------|---------|----------|
| Server connection | 15 seconds | `serverStatus` → `{ state: "error", error: "..." }` |
| Contact scraping | 10 seconds | `scrapingStatus` → `{ state: "not_found", ... }` with page hints |
| Result codes (existing) | 30 seconds | Unchanged, already has timeout |

The server connection timeout is tracked with a timer that starts when `serverStatus` enters `"connecting"`. The timer is cleared when the WebSocket opens. If the WebSocket disconnects and `ReconnectingWebSocket` starts retrying, the timer restarts. This means the error surfaces after 15s of continuous failure, not after the first failed attempt.

The scraping timeout is a simple timer started when the content script loads. If `scrapeContactDetails()` has not returned a non-undefined result within 10 seconds, the status transitions to `"not_found"`. The MutationObserver and polling continue, so if the page loads slowly and a contact eventually appears, the status resets to `"found"`.
