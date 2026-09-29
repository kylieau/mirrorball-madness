# Mid East air · SF on — live-air outcome remocks

**Mock Mosaic · Mirrorball Madness · for Kylie Au**

Dedicated pack: Mid East air window with Spoiler-Free **on**. Each decision state = **one board, two phones**:
- **LEFT** = live-air prompt sheet (locked copy)
- **RIGHT** = full Home **after** that selection (curtain + Soft inset SF strip when posting — not strip-alone crops)

Prod-faithful: phones use `/workspace/mirrorball-live-air-current/01-home.png` as visual base; overlays apply **only** locked copy/behavior deltas (title, chip, Soft Follow-along, SF toggle, curtain Live Now (ET), strip swap, league state).

## GLOBAL LOCKS (applied)

| Surface | Lock |
|---------|------|
| **Title** | **Scores Are Going Live** |
| **Prompt chip** | **Live Now · East Coast** (no clock) |
| **Curtain on Home** | **Live Now (ET)** · chip `Week 3 · Live Now (ET)` |
| **Stay Updated soft** | Follow along as scores are entered |
| **Mark Watched soft** | You’re caught up · scores unlock |
| **Stay soft color** | Same muted as Mark Watched (**never gold**) |
| **SF Mode toggle** | **ON** on prompt for this set |
| **CTA lines** | No Site Admin language |

## Boards (East SF-on · outcomes first)

| PNG | HTML | What |
|-----|------|------|
| `pngs/01-after-stay-updated.png` | `boards/01-after-stay-updated.html` | After **Stay Updated** · drafts unlock + **amber draft strip** (replaces SF posting; don’t stack) |
| `pngs/02-after-mark-watched.png` | `boards/02-after-mark-watched.html` | **LOCKED** · Mark Watched **GRAYED / not selectable** until the episode is completed · Right = Home stays gated |
| `pngs/03-after-dismiss.png` | `boards/03-after-dismiss.html` | After **Dismiss** · Home stays gated · SF strip still posting · no scores unlock |

Optional prompt-alone board skipped — outcomes are priority.

## Lock (board 2)

**Kylie lock, 2026-09-29:** mid-East, Mark Watched is **grayed / not selectable until the episode is completed**. No soft subtext under the grayed button. Right phone is the real mid-East result: Home stays gated, SF strip still posting. No hypothetical IF-selected unlock.

## Path map · reused stills (`stills/`)

| Symlink | Source |
|---------|--------|
| `prod-home.png` | `mirrorball-live-air-current/01-home.png` |
| `prod-prompt-sheet.png` | `mirrorball-live-air-current/01-live-scores-prompt-sheet-390.png` |
| `prod-info-open.png` | `mirrorball-live-air-current/02-live-scores-info-open-390.png` |
| `prod-strip-crop.png` | `mirrorball-live-air-current/02-strip-crop.png` |
| `prod-settings-sf-on.png` | `mirrorball-live-air-current/04-settings-spoiler-free-on.png` |
| `curtain-on-air-now.png` | `mirrorball-curtain-states/pngs/04-on-air-now.png` |
| `soft-inset-pattern-b.png` | `mirrorball-sf-strip-styles/pngs/02-soft-inset.png` |
| `draft-may-change-phone.png` | `mirrorball-draft-scores-strip/pngs/02-a-draft-may-change.png` |
| `sf-placement-b-rest.png` | `mirrorball-sf-strip-placement/pngs/04-b-rest.png` |
| `hybrid-one-league-home.png` | `mirrorball-home-hybrid-one-league/pngs/01-one-league-home.png` |

CSS reuse: `shared.css` + `phone-common.css` ← live-air-prompt · `hybrid-home.css` ← hybrid-one-league · pack-local `remock.css` for overlays.

## Strip rules (this set)

| Path | Soft inset sticky |
|------|-------------------|
| Before choice / Dismiss | `Spoiler-Free · Week 3 posting live` + Mark Watched |
| After Stay Updated (ET) | **Amber** `Draft scores · may change` + (i) — **replaces** SF strip |
| Mark Watched mid-East | Not selectable · Home stays gated · SF strip still posting |

## Regen

```bash
cd /workspace/mirrorball-live-air-east-sf-on && node screenshot.mjs
```

Playwright + `/usr/bin/google-chrome`, `deviceScaleFactor: 2`.

## Absolute PNG paths

- `/workspace/mirrorball-live-air-east-sf-on/pngs/01-after-stay-updated.png`
- `/workspace/mirrorball-live-air-east-sf-on/pngs/02-after-mark-watched.png`
- `/workspace/mirrorball-live-air-east-sf-on/pngs/03-after-dismiss.png`
