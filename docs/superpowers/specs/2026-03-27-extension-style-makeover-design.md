# Extension Style Makeover Design Spec

Align the browser extension's visual design with the server pages' recently updated style, and upgrade from Tailwind CSS v3 to v4.

## Scope

All three extension UI surfaces:
- Popup (264px wide, stats + action buttons)
- Options page (settings form with message templates)
- Content script UI (QR code insert + modal injected into phone bank pages)

## Part 1: Tailwind CSS v4 Migration

### Dependency changes

Remove:
- `tailwindcss@^3.3.3`
- `@tailwindcss/forms@^0.5.4`
- `autoprefixer@^10.4.15`
- `postcss@^8.4.28`

Add:
- `@tailwindcss/vite` (v4's Vite plugin, replaces the PostCSS pipeline)

### Config migration

Delete `tailwind.config.js` and `postcss.config.js`.

Update `assets/main.css` from:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
to:
```css
@import "tailwindcss";
@source "../entrypoints/**/*.{html,tsx,ts}";
@source "../components/**/*.{tsx,ts}";
@source "../lib/**/*.{tsx,ts}";
```

Custom z-index: the `z-1000` utility from `tailwind.config.js` becomes either:
- A `@theme` block in CSS: `@theme { --z-index-1000: 1000; }`
- Or use Tailwind v4's arbitrary value syntax `z-[1000]` directly (simpler, only used in one place)

### Build integration

Add `@tailwindcss/vite` to `wxt.config.ts` vite plugins:
```ts
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: () => ({
    plugins: [preact(), tailwindcss()],
    // ...
  }),
});
```

### Forms plugin

Check if `@tailwindcss/forms` has a v4-compatible version. If yes, add `@plugin "@tailwindcss/forms"` in CSS. If not, drop it since all form elements are already styled with explicit Tailwind utilities.

## Part 2: Style Makeover

### Global palette shift

Every component file:
- `gray-*` to `slate-*` (all shades: 50, 100, 300, 400, 500, 700, 800, 900)
- `yellow-*` to `amber-*` (reconnecting badge)
- `indigo-500` focus rings to `blue-500`

### Popup (`entrypoints/popup/`)

**NavBar** (`App.tsx`):
- `bg-slate-100` to `bg-white border-b border-slate-200`

**CallStats** (`App.tsx`):
- Cards: remove `shadow`, add `border border-slate-200 bg-slate-50`
- Text: `text-gray-500` to `text-slate-500`, `text-gray-900` to `text-slate-900`

**WhiteButton** (`white-button.tsx`):
- `border-gray-300` to `border-slate-200`
- `rounded-md` to `rounded-lg`
- `hover:bg-gray-50` to `hover:bg-slate-50`
- `text-gray-700` to `text-slate-700`
- `focus:ring-indigo-500` to `focus:ring-blue-500`

**SiteStatusIndicator** (`site-status-indicator.tsx`):
- Disabled button: same slate palette swap
- `rounded-md` to `rounded-lg`

**TurboVpbLogoAndName** (`components/turbovpb-logo-and-name.tsx`):
- `text-gray-900` to `text-slate-900`
- Add `font-semibold` to logo text

### Options Page (`entrypoints/options/`)

**App.tsx:**
- Add a nav bar at the top: TurboVPB logo + "Settings" label, `border-b border-slate-200` style matching the server nav and popup nav
- Section headings: `font-medium` to `font-semibold`, `text-gray-900` to `text-slate-900`
- Description text: `text-gray-500` to `text-slate-500`
- Labels: `text-gray-700` to `text-slate-700`
- Info box: add `border-l-4 border-blue-400`, `rounded-md` to `rounded-lg`
- Inputs: `border-gray-300` to `border-slate-300`, `rounded-md` to `rounded-lg`
- Divider: `divide-gray-200` / border color to `slate-200`
- Auto-save text: `text-gray-500` to `text-slate-400`

**MessageTemplateList** (`message-template-list.tsx`):
- "Add Message Template" button: change from `bg-blue-100 text-blue-700` to outlined secondary style: `border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`
- Heading/description text: gray to slate swap

**ShareSettingsButton** (`share-settings-button.tsx`):
- Swap `CloudArrowUpIcon` to `ShareIcon` (from `@heroicons/react/20/solid`)
- Button text stays "Share Templates"
- `rounded-md` to `rounded-lg`

**MessageTemplate** (`components/message-template.tsx`):
- Input borders: `border-gray-300` to `border-slate-300`
- Textarea placeholder: `placeholder-gray-500` to `placeholder-slate-400`
- Trash icon: `text-gray-400` to `text-slate-400`
- Checkbox: `text-blue-600 focus:ring-blue-500` (already correct)
- Checkbox label text: `text-gray-700` to `text-slate-700`

### Content Script UI (`components/`)

**QrCodeInsert** (`qr-code-insert.tsx`):
- Container: `text-gray-700` to `text-slate-700`
- Add `border border-slate-200 rounded-lg bg-white` to the inner container for definition

**QrCodeModal** (`qr-code-modal.tsx`):
- Overlay: `bg-gray-500 bg-opacity-75` to `bg-slate-500/75` (v4 syntax)
- Panel: add `border border-slate-200`
- Close button: `text-gray-400 hover:text-gray-500` to `text-slate-400 hover:text-slate-500`
- Title: `text-gray-900` to `text-slate-900`, add `font-semibold`

**ConnectionStatusBadge** (`components/connection-status-badge.tsx`):
- All badges: `rounded-md` to `rounded-full` (pill shape)
- Connecting: `bg-gray-100 text-gray-800` to `bg-slate-100 text-slate-800`
- Waiting: `bg-blue-100 text-blue-800` stays (already correct)
- Connected: `bg-green-100 text-green-800` stays
- Disconnected: `bg-yellow-100 text-yellow-800` to `bg-amber-100 text-amber-800`

## Files Changed

Config/build:
- `extension/assets/main.css` (rewrite for v4)
- `extension/wxt.config.ts` (add tailwindcss vite plugin)
- `extension/package.json` (dependency swap)
- `extension/tailwind.config.js` (delete)
- `extension/postcss.config.js` (delete)

Components:
- `extension/entrypoints/popup/App.tsx`
- `extension/entrypoints/popup/white-button.tsx`
- `extension/entrypoints/popup/site-status-indicator.tsx`
- `extension/entrypoints/options/App.tsx`
- `extension/entrypoints/options/message-template-list.tsx`
- `extension/entrypoints/options/share-settings-button.tsx`
- `extension/components/turbovpb-logo-and-name.tsx`
- `extension/components/connection-status-badge.tsx`
- `extension/components/message-template.tsx`
- `extension/components/qr-code-modal.tsx`
- `extension/components/qr-code-insert.tsx`

## Testing

- `pnpm dev` in extension/ to verify build succeeds with Tailwind v4
- Visually inspect all three surfaces in Chrome
- Run `pnpm build` and `pnpm build:firefox` to verify production builds
- Run E2E tests from `e2e/` to verify no regressions
