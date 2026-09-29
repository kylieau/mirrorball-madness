# SF × Live-air alignment pack

**Mock Mosaic · Mirrorball Madness · for Kylie Au**

One place to read: **if we’re in this mode / if we do this → what shows.**
Visuals only — Push Pilot owns product/code truth notes.

## Kylie locks (folded into boards · 2026-09-29)

| Surface | Lock |
|---------|------|
| **Title** | **Scores Are Going Live** (title case) |
| **Curtain status** | `Live Now (ET)` / `Live Now (PT)` — replaces `On Air Live ET` / `On Air · Live PT` |
| **Live-air prompt chip** | Coast priming only — `Live Now · East Coast` / `Live Now · West Coast` · **NO clock** |
| **ET Stay soft** | Follow along as scores are entered |
| **PT Stay soft** | Follow along as official scores post |
| **Mark Watched soft** | You’re caught up · scores unlock |
| **Stay Updated button subtext** | Muted / same font color as Mark Watched subtext — **not gold** |
| CTA lines | **No Site Admin** language |

Also locked (prior): prompt only East or West air (not before curtain / ET→PT gap ~7–8pm PT / after night); anyone SF on/off must choose before scores (no auto-show published for SF-off mid-air); (i) About “live”; SF toggle on prompt ↔ Settings Spoiler-Free Mode; SF strip `Spoiler-Free · Week N posting live` + Mark Watched; draft amber after unlock `Draft scores · may change`.

## Boards (swipe PNGs)

| PNG | HTML | What |
|-----|------|------|
| `pngs/01-sf-live-air-matrix.png` | `board-matrix.html` | Scenarios **1–4** · mid-air SF on/off × East/West + no-prompt windows |
| `pngs/02-unlock-strip-sync.png` | `board-unlock-sync.html` | Scenarios **5–6** · unlock outcomes + strip/Settings sync · **gold lock cards** |

## Path map · reused stills (`stills/`)

| Symlink | Source |
|---------|--------|
| `02-et-air-prompt.png` | `mirrorball-live-air-prompt/pngs/02-et-air-prompt.png` |
| `03-pt-air-prompt.png` | `mirrorball-live-air-prompt/pngs/03-pt-air-prompt.png` |
| `04-info-open.png` | `mirrorball-live-air-prompt/pngs/04-info-open.png` |
| `07-unlock-subtext.png` | `mirrorball-live-air-prompt/pngs/07-unlock-subtext.png` |
| `08-implement-steps.png` | `mirrorball-live-air-prompt/pngs/08-implement-steps.png` |
| `02-soft-inset-pattern-b.png` | `mirrorball-sf-strip-styles/pngs/02-soft-inset.png` |
| `04-sf-placement-b-rest.png` | `mirrorball-sf-strip-placement/pngs/04-b-rest.png` |
| `02-draft-may-change.png` | `mirrorball-draft-scores-strip/pngs/02-a-draft-may-change.png` |
| `08-draft-coexist-note.png` | `mirrorball-draft-scores-strip/pngs/08-coexist-note.png` |
| `03-results-sf-week2.png` | `mirrorball-live-air-current/03-results-sf-prompt-week2.png` |
| `04-settings-sf-on.png` | `mirrorball-live-air-current/04-settings-spoiler-free-on.png` |
| `prod-prompt-sheet-390.png` | `mirrorball-live-air-current/01-live-scores-prompt-sheet-390.png` |
| `prod-info-open-390.png` | `mirrorball-live-air-current/02-live-scores-info-open-390.png` |
| `strip-posting.png` | `phone-still-pack/strip-posting.png` |
| `03-sf-banner-live-posting.png` | `mirrorball-sf-banner/pngs/03-live-posting-night.png` |
| `02-mark-watched-current.png` | `mirrorball-mark-watched-ux/pngs/02-current.png` |
| `curtain-*.png` | `mirrorball-curtain-states/pngs/…` |
| `05-home-sf-on-hidden.png` | `mirrorball-west-live-reveal/pngs/05-home-sf-on-hidden.png` |

## Reused vs newly composed

| Kind | What |
|------|------|
| **Reused** | All phone stills / curtain crops above (symlinked — not remocked) |
| **Newly composed** | Matrix + unlock/sync **HTML boards** · gold lock cards · outcome chips · Follow-along CTA soft blocks · captions reflecting Kylie locks |
| **Not remocked** | Full phones still carry older sentence-case title / clock chips / “Site Admin” soft on some stills — boards call that out; lock cards are SoT |

## Scenario glance

| # | Mode | Prompt? | Scores after choice | Strips |
|---|------|---------|---------------------|--------|
| 1 | Mid East · SF on | YES | Stay → drafts · Mark → unlock/caught up | SF posting behind → amber after ET unlock |
| 2 | Mid East · SF off | YES (no auto) | Same · no auto-show | No SF strip |
| 3a/b | Mid West · SF on/off | YES | Stay → published · Mark → unlock | SF strip if on |
| 4 | Before / gap / after night | NO | — | SF Soft inset / Results SF / Settings still |
| 5 | Stay ET / Stay PT / Mark / Dismiss | — | drafts / published / unlock / gated | amber / none / amber-if-drafts / SF stays |
| 6 | Sync | — | — | Prompt SF ↔ Settings ↔ Soft inset · draft replaces SF |

## Regen

```bash
cd /workspace/mirrorball-sf-live-air-alignment && node screenshot.mjs
```

Playwright + `/usr/bin/google-chrome`, `deviceScaleFactor: 2`.

## Hand-off

Pack: `/workspace/mirrorball-sf-live-air-alignment/`
Swipe: `pngs/01-sf-live-air-matrix.png`, `pngs/02-unlock-strip-sync.png`


## GLOBAL RULES (every remock — do not re-ask)
- Title: **Scores Are Going Live**
- Prompt chip: **Live Now · East Coast** / **Live Now · West Coast** (no clock)
- Curtain: **Live Now (ET)** / **Live Now (PT)**
- Soft Follow-along CTA subtext; no Site Admin on CTA lines
- Stay Updated subtext: **same muted color as Mark Watched** (never gold)
