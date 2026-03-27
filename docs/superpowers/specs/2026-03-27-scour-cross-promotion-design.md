# Scour Cross-Promotion on TurboVPB Website

## Goal

Drive user acquisition for [Scour](https://scour.ing) by adding unobtrusive cross-promotion to TurboVPB's server-rendered pages. Leverage the personal/casual tone of a solo creator recommending their other project.

## Surfaces

Two placements, both server-side HTML only. No changes to extension code.

### 1. Session Complete Screen (`server/content/connect.html`)

This screen appears on the mobile connect page when the phone bank session ends. Users are done with their task and in a natural pause, making it the highest-value placement.

Add a card below the existing "Session Complete" box (the `#session-ended` div):

```
From the creator of TurboVPB

Want to stay up to date on the topics you care about? I'm building
Scour, a personalized feed that surfaces interesting reads from across
the web.

Check it out →
```

- Styled as a bordered card, consistent with the existing session-ended card
- "Check it out →" links to `https://scour.ing?ref=turbovpb`
- Hidden by default, shown alongside the session-ended div

### 2. Landing Page Footer (`server/templates/default.html`)

Add a second line below the existing "Created by Evan Schwartz" attribution:

```
Check out my latest project: Scour, a personalized news feed
```

- Same `text-slate-400 text-sm` styling as the existing footer text
- "Scour" links to `https://scour.ing?ref=turbovpb`
- Uses the same `hover:text-slate-600 underline` link style

## Analytics

All links use `?ref=turbovpb` query parameter for attribution tracking in Scour's analytics.

## Out of Scope

- Extension popup, options page, or content script changes
- A/B testing or dynamic promotion logic
- Any server-side tracking of clicks
