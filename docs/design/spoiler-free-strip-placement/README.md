# Spoiler-Free strip placement — Home

Design mocks for the Home Spoiler-Free strip (Mock Mosaic). **Not production UI.**

## Locked — Pattern B

See `LOCKED.md`.

- Sticky wordmark + avatar.
- SF strip sits under branding (never absolute-top).
- On scroll, branding + SF stay sticky together.
- Strip is gone when the viewer is caught up (not mocked here).

Ship crops: `pngs/04-b-rest.png`, `pngs/05-b-scroll.png`.

Pattern A is a rejected alternative kept on the compare board.

## Patterns (board context)

### A — Absolute-top SF (rejected)

SF strip is the first thing under the status bar / safe area — above wordmark, Home title, and avatar.

- **Rest (A1):** SF full-width at top → wordmark + avatar row → large Home title → curtain content.
- **Scroll (A2):** Sticky pin is **SF-only**. Branding scrolls away. The strip floats alone once the wordmark is gone.

### B — Sticky branding + SF (locked)

Wordmark + avatar stay with the SF strip.

- **Rest (B1):** Sticky chrome = wordmark + avatar, then SF directly under that row, then large Home title in content (scrolls).
- **Scroll (B2):** Sticky pin is **wordmark + avatar + SF together**. Home title and content scroll away; branding never leaves the SF strip alone.

## Files

| File | What |
|------|------|
| `LOCKED.md` | Placement lock |
| `pngs/01-sf-placement-board.png` | 4-phone compare board (A Rest \| A Scroll \| B Rest \| B Scroll) |
| `pngs/02-a-rest.png` | A absolute-top · rest |
| `pngs/03-a-scroll.png` | A absolute-top · scroll (SF-only sticky) |
| `pngs/04-b-rest.png` | B branding + SF · rest (ship) |
| `pngs/05-b-scroll.png` | B branding + SF · scroll (ship) |
| `refs/` | Source Home screens the mocks were drawn against |
| `board.html`, `02-a-rest.html` … `05-b-scroll.html` | Phone mocks |
| `shared.css`, `phone-common.css`, `screenshot.mjs` | Rebuild the pngs |

Copy on strip: **Spoiler-Free · Week 2 results are in** + gold **Mark Watched** pill. No couple names.

## Regen

```bash
node screenshot.mjs
```

HTML/CSS → Playwright Chromium @2x. Phone frame ~390×844 logical.
