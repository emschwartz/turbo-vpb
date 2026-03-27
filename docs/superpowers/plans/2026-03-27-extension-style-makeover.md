# Extension Style Makeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the extension from Tailwind CSS v3 to v4 and align its visual style with the server pages' new design language (slate palette, rounded-lg, border accents, pill badges).

**Architecture:** Two-phase approach. First, migrate the build tooling from Tailwind v3 (PostCSS-based) to v4 (Vite plugin) and verify the extension builds and runs. Then, sweep through all 11 component files making class-level style changes. No structural or behavioral changes to any component.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/vite`, WXT, Preact, Vite

**Spec:** `docs/superpowers/specs/2026-03-27-extension-style-makeover-design.md`

---

## File Map

**Config files (create/modify/delete):**
- Modify: `extension/package.json` (dependency swap)
- Modify: `extension/wxt.config.ts` (add Tailwind Vite plugin)
- Modify: `extension/assets/main.css` (rewrite for v4 syntax)
- Delete: `extension/tailwind.config.js`
- Delete: `extension/postcss.config.js`

**Component files (modify only):**
- `extension/components/turbovpb-logo-and-name.tsx`
- `extension/components/connection-status-badge.tsx`
- `extension/components/message-template.tsx`
- `extension/components/qr-code-modal.tsx`
- `extension/components/qr-code-insert.tsx`
- `extension/entrypoints/popup/App.tsx`
- `extension/entrypoints/popup/white-button.tsx`
- `extension/entrypoints/popup/site-status-indicator.tsx`
- `extension/entrypoints/options/App.tsx`
- `extension/entrypoints/options/message-template-list.tsx`
- `extension/entrypoints/options/share-settings-button.tsx`

---

### Task 1: Migrate to Tailwind CSS v4

**Files:**
- Modify: `extension/package.json`
- Modify: `extension/wxt.config.ts`
- Modify: `extension/assets/main.css`
- Delete: `extension/tailwind.config.js`
- Delete: `extension/postcss.config.js`

- [ ] **Step 1: Remove old Tailwind v3 dependencies and add v4**

Run from `extension/`:

```bash
pnpm remove tailwindcss @tailwindcss/forms autoprefixer postcss && pnpm add -D @tailwindcss/vite
```

- [ ] **Step 2: Delete old config files**

Delete these two files:
- `extension/tailwind.config.js`
- `extension/postcss.config.js`

- [ ] **Step 3: Rewrite `extension/assets/main.css` for Tailwind v4**

Replace the entire contents of `extension/assets/main.css` with:

```css
@import "tailwindcss";
@source "../entrypoints/**/*.{html,tsx,ts}";
@source "../components/**/*.{tsx,ts}";
@source "../lib/**/*.{tsx,ts}";
```

- [ ] **Step 4: Add `@tailwindcss/vite` plugin to `extension/wxt.config.ts`**

Add the import at the top and include the plugin in the Vite config. The full file should be:

```ts
import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: '.',
  vite: () => ({
    plugins: [preact(), tailwindcss()],
    resolve: {
      alias: {
        'react': 'preact/compat',
        'react-dom': 'preact/compat',
        'react/jsx-runtime': 'preact/jsx-runtime',
      },
    },
  }),
  manifest: ({ browser }) => ({
    name: 'TurboVPB',
    description:
      'Turbocharge phone banking with OpenVPB, VAN, and BlueVote. Call and text with 2 clicks!',
    version: '0.10.0',
    author: 'Evan Schwartz',
    homepage_url: 'https://turbovpb.com',
    permissions: ['activeTab', 'scripting', 'storage'],
    host_permissions: [
      'https://www.openvpb.com/*',
      'https://*.everyaction.com/*',
      'https://www.votebuilder.com/*',
      'https://phonebank.bluevote.com/*',
      '*://*.turbovpb.com/*',
      'https://*/ContactDetailScript',
      'http://localhost/*',
    ],
    action: {
      default_title: 'TurboVPB',
    },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: '{5ac6de74-7640-4236-a7ed-e19b356b666b}' },
          },
        }
      : {}),
  }),
});
```

- [ ] **Step 5: Replace `z-1000` with `z-[1000]` in `extension/components/qr-code-modal.tsx`**

The custom `z-1000` from `tailwind.config.js` won't exist anymore. Replace both occurrences with Tailwind v4 arbitrary values:

In `extension/components/qr-code-modal.tsx`, change:
- `class="relative z-1000"` to `class="relative z-[1000]"`
- `class="fixed inset-0 z-1000 overflow-y-auto"` to `class="fixed inset-0 z-[1000] overflow-y-auto"`

- [ ] **Step 6: Verify the build works**

Run from `extension/`:

```bash
pnpm build
```

Expected: Build completes successfully with no errors. CSS is generated correctly.

- [ ] **Step 7: Commit**

```bash
git add extension/package.json extension/pnpm-lock.yaml extension/wxt.config.ts extension/assets/main.css extension/components/qr-code-modal.tsx
git rm extension/tailwind.config.js extension/postcss.config.js
git commit -m "refactor(extension): migrate from Tailwind CSS v3 to v4"
```

---

### Task 2: Style shared components

**Files:**
- Modify: `extension/components/turbovpb-logo-and-name.tsx`
- Modify: `extension/components/connection-status-badge.tsx`

- [ ] **Step 1: Update `extension/components/turbovpb-logo-and-name.tsx`**

Change the `<a>` tag class from:
```
text-gray-900 hover:no-underline hover:text-gray-900 visited:no-underline visited:text-gray-900
```
to:
```
text-slate-900 hover:no-underline hover:text-slate-900 visited:no-underline visited:text-slate-900
```

Change the `<div>` from:
```html
<div class="text-lg">TurboVPB</div>
```
to:
```html
<div class="text-lg font-semibold">TurboVPB</div>
```

- [ ] **Step 2: Update `extension/components/connection-status-badge.tsx`**

Replace all four badge class strings:

Connecting (`connectingToServer`):
```
rounded-md bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-800 text-center
```
becomes:
```
rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-800 text-center
```

Waiting (`waitingForMessage`):
```
rounded-md bg-blue-100 px-2.5 py-0.5 text-sm font-medium text-blue-800 text-center
```
becomes:
```
rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium text-blue-800 text-center
```

Connected:
```
rounded-md bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-800 text-center
```
becomes:
```
rounded-full bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-800 text-center
```

Disconnected:
```
rounded-md bg-yellow-100 px-2.5 py-0.5 text-sm font-medium text-yellow-800 text-center
```
becomes:
```
rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800 text-center
```

- [ ] **Step 3: Verify build**

```bash
cd extension && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add extension/components/turbovpb-logo-and-name.tsx extension/components/connection-status-badge.tsx
git commit -m "style(extension): update shared components to server design language"
```

---

### Task 3: Style popup components

**Files:**
- Modify: `extension/entrypoints/popup/App.tsx`
- Modify: `extension/entrypoints/popup/white-button.tsx`
- Modify: `extension/entrypoints/popup/site-status-indicator.tsx`

- [ ] **Step 1: Update `extension/entrypoints/popup/App.tsx`**

HelpButton: change `class="text-gray-700"` to `class="text-slate-700"`.

NavBar: change `class="flex flex-row items-center p-3 bg-slate-100"` to `class="flex flex-row items-center p-3 bg-white border-b border-slate-200"`.

CallStats first card: change `class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow"` to `class="overflow-hidden rounded-lg bg-slate-50 px-4 py-5 border border-slate-200"`.

CallStats first card dt: change `text-gray-500` to `text-slate-500`.

CallStats first card dd: change `text-gray-900` to `text-slate-900`.

CallStats second card: same changes as first card. Change `class="overflow-hidden rounded-lg bg-white px-4 py-5 shadow"` to `class="overflow-hidden rounded-lg bg-slate-50 px-4 py-5 border border-slate-200"`.

CallStats second card dt: change `text-gray-500` to `text-slate-500`.

CallStats second card dd: change `text-gray-900` to `text-slate-900`.

- [ ] **Step 2: Update `extension/entrypoints/popup/white-button.tsx`**

Change the button class from:
```
inline-flex items-center rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
```
to:
```
inline-flex items-center rounded-lg border border-slate-200 bg-white px-6 py-3 text-base font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
```

- [ ] **Step 3: Update `extension/entrypoints/popup/site-status-indicator.tsx`**

Change the disabled button class from:
```
inline-flex items-center rounded-md border border-gray-300 bg-gray-100 px-6 py-3 text-base font-medium text-gray-700 shadow-sm focus:outline-none
```
to:
```
inline-flex items-center rounded-lg border border-slate-200 bg-slate-100 px-6 py-3 text-base font-medium text-slate-700 shadow-sm focus:outline-none
```

- [ ] **Step 4: Verify build**

```bash
cd extension && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add extension/entrypoints/popup/
git commit -m "style(extension): update popup to server design language"
```

---

### Task 4: Style options page components

**Files:**
- Modify: `extension/entrypoints/options/App.tsx`
- Modify: `extension/entrypoints/options/message-template-list.tsx`
- Modify: `extension/entrypoints/options/share-settings-button.tsx`
- Modify: `extension/components/message-template.tsx`

- [ ] **Step 1: Update `extension/entrypoints/options/App.tsx`**

Add import for `TurboVpbLogoAndName` at the top:
```ts
import TurboVpbLogoAndName from '../../components/turbovpb-logo-and-name';
```

TextReplacement section heading: change `class="text-lg leading-6 font-medium text-gray-900"` to `class="text-lg leading-6 font-semibold text-slate-900"`.

TextReplacement description: change `className="mt-1 text-sm text-gray-500"` to `className="mt-1 text-sm text-slate-500"`.

Your Name label: change `class="block text-sm font-medium text-gray-700"` to `class="block text-sm font-medium text-slate-700"`.

Your Name input: change `class="block max-w-lg rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"` to `class="block max-w-lg rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"`.

Info box outer div: change `class="mt-6 rounded-md bg-blue-50 p-4"` to `class="mt-6 rounded-lg bg-blue-50 p-4 border-l-4 border-blue-400"`.

AdvancedSettings heading: change `class="text-lg leading-6 font-medium text-gray-900"` to `class="text-lg leading-6 font-semibold text-slate-900"`.

Server URL label: change `class="block text-sm font-medium text-gray-700"` to `class="block text-sm font-medium text-slate-700"`.

Server URL input: change `class="block max-w-lg rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"` to `class="block max-w-lg rounded-lg border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"`.

OptionsPage container: change `class="container p-8 space-y-8 divide-gray-200 mx-auto"` to `class="container p-8 space-y-8 divide-slate-200 mx-auto"`.

Add a nav bar before the container. The OptionsPage component should return:
```tsx
<div>
  <nav class="border-b border-slate-200 bg-white px-8 py-3 flex items-center gap-3">
    <TurboVpbLogoAndName />
    <span class="text-sm text-slate-400">Settings</span>
  </nav>
  <div class="container p-8 space-y-8 divide-slate-200 mx-auto">
    <TextReplacement />
    <MessageTemplateList templates={messageTemplates} serverUrl={serverUrl} />
    <hr />
    <AdvancedSettings />
    <p class="font-medium text-sm text-slate-400 mt-6">
      Settings are saved automatically.
    </p>
  </div>
</div>
```

Auto-save text: change `text-gray-500` to `text-slate-400`.

- [ ] **Step 2: Update `extension/entrypoints/options/message-template-list.tsx`**

Heading: change `class="text-lg font-medium leading-6 text-gray-900"` to `class="text-lg font-semibold leading-6 text-slate-900"`.

Description: change `class="mt-1 text-sm leading-5 text-gray-500"` to `class="mt-1 text-sm leading-5 text-slate-500"`.

"Add Message Template" button: change `className="inline-flex items-center rounded-md border border-transparent bg-blue-100 px-3 py-2 text-sm font-medium leading-4 text-blue-700 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"` to `className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium leading-4 text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"`.

PlusCircleIcon: change `className="-ml-1 mr-2 h-5 w-5"` to `className="-ml-1 mr-2 h-5 w-5 text-slate-400"` (so the icon matches the new muted button style).

- [ ] **Step 3: Update `extension/entrypoints/options/share-settings-button.tsx`**

Change the import from:
```ts
import { CloudArrowUpIcon } from "@heroicons/react/20/solid";
```
to:
```ts
import { ShareIcon } from "@heroicons/react/20/solid";
```

Change the button class from:
```
inline-flex items-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
```
to:
```
inline-flex items-center rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
```

Change the icon from:
```tsx
<CloudArrowUpIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
```
to:
```tsx
<ShareIcon className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
```

- [ ] **Step 4: Update `extension/components/message-template.tsx`**

SelectTexted checkbox: change `className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"` to `className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"`.

SelectTexted label: change `className="text-gray-700"` to `className="text-slate-700"`.

Template label input container: change `class="relative mt-1 -space-y-px rounded-md bg-white shadow-sm"` to `class="relative mt-1 -space-y-px rounded-lg bg-white shadow-sm"`.

Template label input: change `class="relative block w-full rounded-md rounded-b-none border-gray-300 bg-transparent focus:z-10 focus:border-blue-500 focus:ring-blue-500"` to `class="relative block w-full rounded-lg rounded-b-none border-slate-300 bg-transparent focus:z-10 focus:border-blue-500 focus:ring-blue-500"`.

Trash icon: change `class="h-5 w-5 text-gray-400"` to `class="h-5 w-5 text-slate-400"`.

Textarea container: change `class="relative rounded-md -space-y-px rounded-t-none border border-gray-300 px-3 py-2 focus-within:z-10 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600"` to `class="relative rounded-lg -space-y-px rounded-t-none border border-slate-300 px-3 py-2 focus-within:z-10 focus-within:border-blue-600 focus-within:ring-1 focus-within:ring-blue-600"`.

Textarea: change `class="block w-full border-0 p-0 text-gray-900 placeholder-gray-500 focus:ring-0"` to `class="block w-full border-0 p-0 text-slate-900 placeholder-slate-400 focus:ring-0"`.

- [ ] **Step 5: Verify build**

```bash
cd extension && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add extension/entrypoints/options/ extension/components/message-template.tsx
git commit -m "style(extension): update options page to server design language"
```

---

### Task 5: Style content script UI components

**Files:**
- Modify: `extension/components/qr-code-modal.tsx`
- Modify: `extension/components/qr-code-insert.tsx`

- [ ] **Step 1: Update `extension/components/qr-code-modal.tsx`**

Overlay div: change `class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"` to `class="fixed inset-0 bg-slate-500/75 transition-opacity"`.

Dialog.Panel: change `class="relative transform overflow-hidden rounded-lg p-4 bg-white text-center shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6"` to `class="relative transform overflow-hidden rounded-lg border border-slate-200 p-4 bg-white text-center shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-sm sm:p-6"`.

Close button: change `class="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"` to `class="rounded-lg bg-white text-slate-400 hover:text-slate-500 focus:outline-none"`.

Dialog.Title: change `class="leading-6 text-gray-900"` to `class="leading-6 text-slate-900"`.

Title span: change `class="ml-3 text-4xl font-light"` to `class="ml-3 text-4xl font-semibold"`.

- [ ] **Step 2: Update `extension/components/qr-code-insert.tsx`**

Inner container div: change `class="grid grid-cols-1 place-items-center space-y-2 mx-auto my-2 py-2.5 px-3 text-gray-700"` to `class="grid grid-cols-1 place-items-center space-y-2 mx-auto my-2 py-2.5 px-3 text-slate-700 border border-slate-200 rounded-lg bg-white"`.

- [ ] **Step 3: Verify build and run**

```bash
cd extension && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add extension/components/qr-code-modal.tsx extension/components/qr-code-insert.tsx
git commit -m "style(extension): update content script UI to server design language"
```

---

### Task 6: Final verification

- [ ] **Step 1: Build for Chrome**

```bash
cd extension && pnpm build
```

Expected: Clean build, no warnings related to Tailwind.

- [ ] **Step 2: Build for Firefox**

```bash
cd extension && pnpm build:firefox
```

Expected: Clean build.

- [ ] **Step 3: Run E2E tests**

```bash
cd extension && pnpm build && cd ../e2e && npm test
```

Expected: All E2E tests pass.

- [ ] **Step 4: Manual visual check**

Run `cd extension && pnpm dev` and inspect:
1. Popup: slate colors, border-bottom nav, bordered stat cards, rounded-lg buttons
2. Options page: nav bar with logo + "Settings", left-border info box, slate palette, share icon
3. On a test phonebank page: QR code insert with border, pill-shaped status badges, modal with slate overlay
