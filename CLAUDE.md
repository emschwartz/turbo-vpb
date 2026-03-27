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

- **`background.ts`** - Service worker. Handles permission changes, dynamically injects content scripts.
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

## Tech Choices

- **Preact** (not React) with `@preact/signals` for reactivity. React aliases configured in `wxt.config.ts`.
- **WXT** (Web eXtension Tooling) for building the Manifest V3 extension. Config in `wxt.config.ts`.
- Server pages use **Tailwind CSS** compiled via standalone CLI binary (`./tailwindcss`), not via npm.
- Server client-side JS (`server/src-js/`) is written in **TypeScript** and compiled to `server/static/js/` via **esbuild** (pnpm). The compiled JS files are gitignored.
- Server deployed to **Fly.io** (config in `server/fly.toml`).
