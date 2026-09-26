# Spoiler-Free strip visual styles — Pattern B

Design mocks for the Home Spoiler-Free strip (Mock Mosaic). **Not production UI.** Placement is the locked Pattern B pack (`../spoiler-free-strip-placement/`): sticky wordmark + avatar, SF treatment directly under branding.

## Locked — Soft inset

See `LOCKED.md`.

- Tinted mauve fill.
- Single hairline under the sticky stack (no hard gold double-rails).
- Gold status dot + gold **Mark Watched** pill.
- Copy like **Spoiler-Free · Week N …** + Mark Watched.

Ship crops: `pngs/02-soft-inset.png` (rest), `pngs/06-soft-scroll.png` (scroll).

**Chip**, **Compact**, and **Accent** are rejected alternatives kept for board context.

Strip is gone when the viewer is caught up (not mocked here).

## Styles (board context)

| # | Name | Treatment |
|---|------|-----------|
| 1 | **Soft inset** (locked) | Tinted mauve fill under branding + single hairline under the sticky stack. Gold status dot + gold Mark Watched pill. Quieter full-bleed band. |
| 2 | **Chip row** (rejected) | No full-bleed bar. Status as a rounded pill chip + Mark Watched beside it in sticky padding (toolbar-like). |
| 3 | **Compact one-line** (rejected) | Merge into branding: small SF under the wordmark; Mark Watched as a ghost/outline near the avatar. Thinnest chrome. |
| 4 | **Accent rail** (rejected) | Tinted band, thin left gold edge + top hairline, slightly rounded bottom corners. |

**Earlier chrome (contrast only):** hard gold double-rail, sharp corners — labeled in the board footer; not a fifth column. Same B placement as the placement-pack rest/scroll.

Reference copy on the mocks: **Spoiler-Free · Week 2 results are in**. No couple names.

## Files

| File | What |
|------|------|
| `LOCKED.md` | Style lock |
| `pngs/01-sf-styles-board.png` | Board: Soft \| Chip \| Compact \| Accent (rest) + Soft/Chip scroll pair |
| `pngs/02-soft-inset.png` | Soft inset · rest (ship) |
| `pngs/03-chip-row.png` | Chip row · rest (rejected) |
| `pngs/04-compact.png` | Compact one-line · rest (rejected) |
| `pngs/05-accent-rail.png` | Accent rail · rest (rejected) |
| `pngs/06-soft-scroll.png` | Soft inset · scroll (ship) |
| `pngs/07-chip-scroll.png` | Chip row · scroll (rejected) |
| `board.html`, `02-soft-inset.html` … `07-chip-scroll.html` | Phone mocks |
| `shared.css`, `phone-common.css`, `gen.mjs`, `screenshot.mjs` | Rebuild the pngs |

## Regen

```bash
node gen.mjs        # rebuild HTML from templates
node screenshot.mjs # Playwright Chromium @2x
```

Phone frame ~390×844 logical.
