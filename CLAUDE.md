# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TurboVPB is a browser extension that accelerates phone banking with virtual phone bank platforms (OpenVPB, VAN/VoteBuilder, BlueVote). It scrapes contact details from phone bank pages, encrypts them end-to-end (AES-GCM, key in URL fragment so the server never sees it), and relays them to a mobile phone via WebSocket for easy calling/texting.

## Repository Structure

Monorepo with three independent components:

- **`extension/`** - Browser extension (TypeScript, Preact, WXT, Tailwind CSS, pnpm)
- **`server/`** - Relay server (Rust, Axum, Tokio, Prometheus metrics) with client-side TypeScript (esbuild)
- **`e2e/`** - End-to-end tests (Playwright)

Each has its own package manager and lock file. No shared workspace tooling.

## Setup

```bash
just install      # Install all deps (extension + e2e) and configure git hooks
```

This runs `pnpm install` in `extension/` and `server/`, `npm install` in `e2e/`, and sets `core.hooksPath` to `.githooks/` for pre-commit checks.

## Common Commands

All commands run from the repo root via the justfile.

### Development
```bash
just dev          # Run server + extension (Chrome) together
just df           # Run server + extension (Firefox)
just server-run   # Run server only (RUST_LOG=turbovpb_server=trace)
just server-css-watch  # Watch mode for server Tailwind CSS
just server-js-watch   # Watch mode for server client-side TypeScript
```

### Building
```bash
just build              # Build everything (extension + server CSS + server JS + server binary)
just ext-build          # Build extension only (Chrome)
just ext-build firefox  # Build extension only (Firefox)
just server-build       # Build server only
just server-css         # Build server Tailwind CSS
just server-js          # Compile server client-side TypeScript
```

### Linting and formatting
```bash
# Server (Rust)
cd server && cargo fmt --check    # Check formatting
cd server && cargo clippy -- -D warnings  # Lint

# Extension (TypeScript)
cd extension && pnpm typecheck    # Type check
cd extension && pnpm format:check # Prettier check
```

The pre-commit hook (`.githooks/pre-commit`) runs all four checks above.

### E2E tests
```bash
just test         # Build extension then run Playwright tests (headless)
just e2e          # Run Playwright tests only (extension must be pre-built)
just e2e-headed   # Run with visible browser
```
Playwright auto-starts the server on port 8089. Tests run serially (extensions require single worker).

## Architecture

### Extension entry points (WXT conventions in `extension/entrypoints/`)

- **`background.ts`** - Service worker. Handles permission changes, dynamically injects content scripts, and proxies `storage.session` for content scripts, kept per tab (`lib/tab-session-storage.ts`) so two phone bank tabs don't share the phone, while a closed tab's session is resumed by the next new tab.
- **`content/index.tsx`** - Main content script. Runs on phone bank pages. Scrapes contacts every 500ms, manages WebSocket connection, renders QR code modal for mobile pairing.
- **`share-integration.content.ts`** - Runs on `turbovpb.com/share*`. Handles message template imports.
- **`popup/`** - Extension popup. Shows call stats and navigation.
- **`options/`** - Options page. Message templates, custom server URL, user name.

### VPB platform integrations (`extension/lib/vpb-integrations/`)

Each file exports a scraper for a specific phone bank platform. `index.ts` auto-detects the platform from the page URL and selects the right scraper.

### Server modules (`server/src/`)

- **`main.rs`** - Axum routes, static file serving, SQLite init
- **`pubsub.rs`** - In-memory WebSocket relay using DashMap. Channels timeout after 30min of inactivity.
- **`stats.rs`** - Call/text analytics stored in SQLite (path configurable via `DATABASE_PATH` env var, defaults to `data/turbovpb.db`)
- **`pages.rs`** - Server-rendered HTML pages (TinyTemplate, embedded in binary)
- **`metrics.rs`** - Prometheus metrics on port 8081

### Data flow

1. Content script scrapes contact from phone bank page
2. Contact encrypted with AES-GCM (key generated client-side, passed in URL hash)
3. Encrypted message sent via WebSocket to server's pubsub relay
4. Server forwards to mobile browser (also connected via WebSocket)
5. Mobile browser decrypts and displays contact for calling/texting

Two transport facts shape every handler on both sides:

- **The phone's socket drops on every call.** Mobile browsers close the WebSocket when the volunteer switches to the dialer or messaging app, and the connect page reconnects when they switch back. A `peerDisconnected` from the phone is routine, not a sign the pairing was lost (issue #2 was the QR code modal reopening on every call).
- **Messages are relayed in the order the server receives them.** Each side sends one message at a time (`PubSubClient.send`, `PeerManager.sendMessage`), since concurrent POSTs can arrive out of order: the extension re-sends the previous contact with updated stats just before the next contact, and the phone showed the previous contact again when that arrived last.
- **Every reconnect replays a message.** The server stores each side's last message and sends it to the other side whenever that side (re)connects, so any message can arrive twice and late. Handlers must be idempotent: call results and other one-shot messages carry a `seq` and `timestamp` and are deduplicated (`claimMessage` in the extension, pending seqs on the connect page); presence messages (`peerConnected` / `peerDisconnected`) say whether a message is live.
- **Every message is bound to its sender.** Both sides share one key, and anyone who knows the channel id can post to either side, so each ciphertext carries its sender (`"extension"` or `"browser"`) as AES-GCM additional data and a message posted back to the side that sent it fails to decrypt. Receivers also accept unbound messages from older peers: the connect page sends bound messages only to extensions at 0.12 or later (the `version` query param), and the extension, only when a custom server URL is configured (a self-hosted server may serve an older connect page), sends unbound messages after the phone sends an unbound one, until it sends a bound one (`PubSubClient.sendBound`). With the default server it always sends bound, since an unbound phone message there can only be a replay.

## Tech Choices

- **Preact** (not React) with `@preact/signals` for reactivity. React aliases configured in `wxt.config.ts`.
- **WXT** (Web eXtension Tooling) for building the Manifest V3 extension. Config in `wxt.config.ts`.
- Server pages use **Tailwind CSS** compiled via standalone CLI binary (`./tailwindcss`), not via npm.
- Server client-side JS (`server/src-js/`) is written in **TypeScript** and compiled to `server/static/js/` via **esbuild** (pnpm). The compiled JS files are gitignored.
- Server deployed to **Fly.io** (config in `server/fly.toml`).
