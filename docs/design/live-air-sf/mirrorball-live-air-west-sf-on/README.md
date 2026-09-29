# Mid West air · SF on — live-air outcome remocks

**Mock Mosaic · Mirrorball Madness · for Kylie Au**

Dedicated pack: Mid West air window with Spoiler-Free **on**. Each decision state = **one board, two phones**:
- **LEFT** = live-air prompt sheet (locked copy)
- **RIGHT** = full Home **after** that selection (curtain + Soft inset when relevant — not strip-alone crops)

Prod-faithful: phones use `/workspace/mirrorball-live-air-current/01-home.png` as visual base; overlays apply **only** locked copy/behavior deltas (title, chip, Soft Follow-along, SF toggle, curtain Live Now (PT), strip swap / clear, league state).

## GLOBAL LOCKS (applied)

| Surface | Lock |
|---------|------|
| **Title** | **Scores Are Going Live** |
| **Prompt chip** | **Live Now · West Coast** (no clock) |
| **Curtain on Home** | **Live Now (PT)** · chip `Week 3 · Live Now (PT)` |
| **Stay Updated soft** | Follow along as official scores post |
| **Mark Watched soft** | You’re caught up · scores unlock |
| **Stay soft color** | Same muted as Mark Watched (**never gold**) |
| **SF Mode toggle** | **ON** on prompt for this set |
| **CTA lines** | No Site Admin language |
| **(i)** | Trailing title |

## Boards (West SF-on · outcomes)

| PNG | HTML | What |
|-----|------|------|
| `pngs/01-after-stay-updated.png` | `boards/01-after-stay-updated.html` | After **Stay Updated** · **published** scores unlock · Soft inset **Scores live · Week 3 published** (no amber drafts) |
| `pngs/02-after-mark-watched.png` | `boards/02-after-mark-watched.html` | **Mark Watched ENABLED** (West episode done) · Right = caught up / published unlock · Soft inset gone |
| `pngs/03-after-dismiss.png` | `boards/03-after-dismiss.html` | After **Dismiss** · Home stays gated · SF strip still `Spoiler-Free · Week 3 posting live` + Mark Watched · curtain Live Now (PT) |

## West-specific locks (vs East)

1. **Stay Updated (PT)** → unlocks **published** scores — **no drafts**. Amber draft strip does **NOT** appear. Soft inset → published/live strip (or gone). SF posting strip does not stack with drafts (there are none).
2. **Mark Watched** → **ENABLED** on West (episode done for West air — NOT grayed). Do **not** reopen mid-East Mark Watched gray.
3. **Dismiss** → Home stays gated; SF strip still posting; curtain Live Now (PT).

## Path map · reused stills (`stills/`)

| Symlink | Source |
|---------|--------|
| `prod-home.png` | `mirrorball-live-air-current/01-home.png` |
| `prod-prompt-sheet.png` | `mirrorball-live-air-current/01-live-scores-prompt-sheet-390.png` |
| `prod-info-open.png` | `mirrorball-live-air-current/02-live-scores-info-open-390.png` |
| `prod-strip-crop.png` | `mirrorball-live-air-current/02-strip-crop.png` |
| `prod-settings-sf-on.png` | `mirrorball-live-air-current/04-settings-spoiler-free-on.png` |
| `curtain-on-air-now.png` | `mirrorball-curtain-states/pngs/04-on-air-now.png` |
| `curtain-pacific-during.png` | `mirrorball-curtain-states/pngs/08-pacific-during.png` |
| `soft-inset-pattern-b.png` | `mirrorball-sf-strip-styles/pngs/02-soft-inset.png` |
| `sf-placement-b-rest.png` | `mirrorball-sf-strip-placement/pngs/04-b-rest.png` |
| `hybrid-one-league-home.png` | `mirrorball-home-hybrid-one-league/pngs/01-one-league-home.png` |

CSS reuse: `shared.css` + `phone-common.css` ← live-air-prompt · `hybrid-home.css` ← hybrid-one-league · pack-local `remock.css` for overlays.

## Strip rules (this set)

| Path | Soft inset sticky |
|------|-------------------|
| Before choice / Dismiss | `Spoiler-Free · Week 3 posting live` + Mark Watched |
| After Stay Updated (PT) | **Published** `Scores live · Week 3 published` + (i) — **replaces** SF strip · **no amber drafts** |
| After Mark Watched (West) | Soft inset **gone** · caught up · published unlock |

## Regen

```bash
cd /workspace/mirrorball-live-air-west-sf-on && node screenshot.mjs
```

Playwright + `/usr/bin/google-chrome`, `deviceScaleFactor: 2`.

## Absolute PNG paths

- `/workspace/mirrorball-live-air-west-sf-on/pngs/01-after-stay-updated.png`
- `/workspace/mirrorball-live-air-west-sf-on/pngs/02-after-mark-watched.png`
- `/workspace/mirrorball-live-air-west-sf-on/pngs/03-after-dismiss.png`
