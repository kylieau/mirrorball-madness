# Mirrorball Madness — Logo / Design Pack (v0)

**Status:** proposed for sign-off — stays inside the live app look (dark plum curtain + gold), does not invent a new theme.

**Source of truth for UI tokens:** `src/app/globals.css` (“dark curtain + gold mirrorball”).

## What’s in here

| File | Use |
|------|-----|
| `assets/current-icon-mm.png` | Shipping today: bright purple + white **MM** |
| `assets/01-icon-mm-gold.jpg` | Proposed app icon — **MM** on plum with soft gold rim |
| `assets/02-icon-disco.jpg` | Proposed app icon — gold mirrorball on plum |
| `assets/03-wordmark.jpg` | Horizontal lockup (mark + wordmark) |
| `assets/04-lockup-stacked.jpg` | Stacked splash / marketing lockup |
| `assets/05-mark-glyph.jpg` | Small top-bar / favicon glyph (replaces 🪩 emoji option) |
| `board.html` + `pngs/board.png` | One-page brand board |
| `TOKENS.md` | Exact colors + type from the app |

## Design rails (don’t stray)

- **One theme only** — no light mode, no cyan/neon, no bright purple UI chrome.
- **Primary gold** `#c9a24b` for CTAs, borders, rules, accents.
- **Background** `#1e1420`, **cards** `#271a29`, **cream type** `#f2e8d8`.
- **Type:** Fraunces (headings / wordmark), Inter (UI), Libre Caslon (rank nums only).
- Wordmark stays **Mirrorball Madness** (Title Case). Top bar today is emoji + muted label; glyph option is optional polish.

## Soft-lock (Kylie · 2026-09-30)

1. **App icon — LOCKED lean:** `assets/02-icon-disco.jpg` (gold mirrorball on plum). Keep `01-icon-mm-gold.jpg` as optional monogram fallback only.
2. **Wordmark / stacked splash / top-bar glyph** (`03`, `04`, `05`): **proposed only** — not locked yet.
3. Tokens stay live `globals.css` (plum `#1e1420` + gold `#c9a24b`); do not invent a new theme.

Eng path: `docs/design/logo/` (this pack). No app-asset swap in this commit unless separately asked.

## Out of scope

- Full UI redesign, new color system, light theme, DWTS trademark artwork.
