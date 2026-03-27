# E2E Integration Testing Design

## Purpose

Add end-to-end tests that verify the core interaction between the extension content script, the PubSub server, and the connect page. These components communicate via encrypted WebSocket messages through independently implemented crypto layers, and there are currently no tests to catch regressions when any of them change.

## Architecture

### Test Framework

**Playwright Test** with Chromium. Chosen because:
- First-class Chrome extension support via `chromium.launchPersistentContext` with `--load-extension`
- Multiple browser contexts in one test (extension page + connect page)
- Built-in assertions, auto-waiting, and `webServer` config for managing the Rust server

### Test Location

`e2e/` at the repo root (spans both `extension/` and `server/`).

```
e2e/
  playwright.config.ts
  tests/
    e2e.spec.ts
  package.json
```

### Prerequisites

1. **Extension build:** `cd extension && npm run build` produces `extension/.output/chrome-mv3/`
2. **Rust server:** Playwright's `webServer` config runs `cargo run --manifest-path ../server/Cargo.toml` on port 8080

### Browser Context Setup

- One `chromium.launchPersistentContext` with `--load-extension` pointing at the built extension. This context loads the `/test-phonebank` page where the content script injects.
- A second browser instance (no extension needed) loads the `/connect` page, simulating the mobile phone.

### Pointing the Extension at Localhost

The extension reads `serverUrl` from `browser.storage.local`, defaulting to `https://next.turbovpb.com`. Tests set this to `http://localhost:8080` via the extension's background page using `chrome.storage.local.set()`.

### Extracting the Connect URL

Rather than decoding the QR code image, tests read the connect URL directly from the DOM. The extension renders the URL in its QR code components, and the underlying value can be extracted via `page.evaluate()` or by reading a link `href`.

### Test-Phonebank Page Changes

Remove the `randomuser.me` API dependency. Hardcode a small list of test contacts directly in `/test-phonebank` and cycle through them on "Save Results & Load Next".

## Test Scenarios

### Test 1: Contact details flow from extension to connect page

1. Load `/test-phonebank` in the extension browser context
2. Wait for the content script to inject the TurboVPB sidebar and generate a QR code
3. Extract the connect URL (contains `channelId` and `encryptionKey` in the URL hash)
4. Open the connect URL in a second browser context
5. Assert: The connect page displays the contact name and phone number from the test-phonebank page

Verifies: PubSub channel creation, encryption key exchange via URL hash, AES-GCM encrypt/decrypt compatibility between the extension's `crypto.ts` and the connect page's `peer-manager.js`, DOM scraping by the OpenVPB integration, and contact display rendering.

### Test 2: Call result flows back from connect page to extension

1. Same setup as Test 1 (connected)
2. Wait for call result buttons to appear on the connect page
3. Click a result button (e.g. "Left Voicemail")
4. Assert: The test-phonebank page loads a new contact (extension received the `callResult` message, called `vpb.markResult()`, which clicks the result radio and "Save Results & Load Next")

Verifies: Bidirectional encrypted messaging, `callResult` message format compatibility, extension's ability to programmatically interact with the phone bank page.

### Test 3: Reconnection after page reload

1. Same setup as Test 1 (connected)
2. Reload the test-phonebank page (extension reconnects, sends `{type: "connect"}`)
3. Assert: The connect page receives and displays updated contact details

Verifies: Reconnection flow, `connect` message handling, state recovery after page reload.

## CI Pipeline

### GitHub Actions Workflow (`.github/workflows/e2e.yml`)

Triggers on every push.

**Steps:**
1. Checkout code
2. Install Rust toolchain (stable), cache `server/target/`
3. Install Node, cache `node_modules/` for `extension/` and `e2e/`
4. Build extension (`cd extension && npm ci && npm run build`)
5. Install Playwright Chromium (`cd e2e && npx playwright install chromium --with-deps`)
6. Run tests (`cd e2e && npx playwright test`), Playwright config handles starting the Rust server

### Playwright `webServer` Config

```ts
webServer: {
  command: 'cargo run --manifest-path ../server/Cargo.toml',
  port: 8080,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
}
```

`reuseExistingServer` lets developers run the server manually during local development for faster test iteration.
