# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TurboVPB is a browser extension that accelerates phone banking with virtual phone bank platforms (OpenVPB, VAN/VoteBuilder, BlueVote). It scrapes contact details from phone bank pages, encrypts them end-to-end (AES-GCM, key in URL fragment so the server never sees it), and relays them to a mobile phone via WebSocket for easy calling/texting.

## Repository Structure

Monorepo with three independent components:

- **`extension/`** - Browser extension (TypeScript, Preact, WXT, Tailwind CSS, pnpm)
- **`server/`** - Relay server (Rust, Axum, Tokio, Prometheus metrics)
- **`e2e/`** - End-to-end tests (Playwright)

Each has its own package manager and lock file. No shared workspace tooling.

## Common Commands

### Full-stack development (from repo root)
```bash
just dev          # Run server + extension (Chrome) together
just df           # Run server + extension (Firefox)
```

### Extension (from `extension/`)
```bash
pnpm install      # Install dependencies
pnpm dev          # Dev mode (Chrome)
pnpm dev:firefox  # Dev mode (Firefox)
pnpm build        # Production build (Chrome)
pnpm build:firefox
```

### Server (from `server/`)
```bash
just run          # cargo run with RUST_LOG=turbovpb_server=trace
cargo build       # Build only
just css          # Build Tailwind CSS for server pages
just css-watch    # Watch mode for server CSS
```

### E2E tests (from `e2e/`)
```bash
npm test              # Headless Playwright tests (auto-starts server)
npm run test:headed   # With visible browser
```
Playwright auto-starts the server on port 8089. Extension must be pre-built (`pnpm build` in `extension/`). Tests run serially (extensions require single worker).

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

- **`main.rs`** - Axum routes, static file serving, optional BigQuery client init
- **`pubsub.rs`** - In-memory WebSocket relay using DashMap. Channels timeout after 30min of inactivity.
- **`stats.rs`** - Call/text analytics batched to BigQuery every 30s (requires `GOOGLE_SERVICE_ACCOUNT_KEY` env var)
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
- Server deployed to **Fly.io** (config in `server/fly.toml`).
