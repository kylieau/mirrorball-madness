# Claude handoff — Live-air + SF alignment (Mirrorball Madness)

Planning SoT from Push Pilot / Mock Mosaic. Do not invent UI; implement locks below.

Repo copy: each pack below is a folder of the same name under `docs/design/live-air-sf/`. The `/workspace/...` paths are the original Mock Mosaic locations.

## Packs (visual SoT)

| Pack | Path |
|------|------|
| East SF-on outcomes | `/workspace/mirrorball-live-air-east-sf-on/` |
| West SF-on outcomes | `/workspace/mirrorball-live-air-west-sf-on/` |
| Follow along placement | `/workspace/mirrorball-follow-along-latest/` |
| Post–East gap Option A | `/workspace/mirrorball-draft-gap-post-east/` |
| SF × live-air alignment | `/workspace/mirrorball-sf-live-air-alignment/` |
| Earlier live-air prompt set | `/workspace/mirrorball-live-air-prompt/` (some phones stale vs locks) |
| Prod stills | `/workspace/mirrorball-live-air-current/` |

### 1. Live-air prompt — when / who
- Show only during active East or West air window.
- Do not show: before curtain · ET→PT gap · after night ends.
- Anyone opening mid-window (SF on or off) must choose before live scores show.
- Change from today: SF-off must not auto-see published mid-air.

### 2. Prompt chrome / copy
| Surface | Lock |
|--------|------|
| Title | Scores Are Going Live |
| Chip | Live Now · East Coast / Live Now · West Coast — no clock |
| Buttons | Stay Updated — I'm Watching Live · Mark Watched — I've Finished It · Dismiss (no (PT)/(ET) on labels) |
| Stay Updated subtext | Same muted color as Mark Watched (not gold) |
| Soft CTA | ET Stay: Follow along as scores are entered · PT Stay: Follow along as official scores post · Mark (when enabled): You’re caught up · scores unlock |
| SF toggle | Wired to Settings → Spoiler-Free Mode |
| (i) | On title; About “live” = Site Admin posting — drafts East / published Pacific; gated until Stay or Mark; either marks earlier weeks watched |

### 3. Unlock matrix
| Action | Coast | Result |
|--------|-------|--------|
| Stay Updated | East | Unlock drafts |
| Stay Updated | West | Published only — no drafts |
| Mark Watched | either (when enabled) | Unlock drafts + caught up |
| Dismiss | either | Stay gated |
| Default / SF-off alone | — | Never unlock drafts |

### 4. Mid-East Mark Watched
- Gray / not selectable until episode completed.
- No soft subtext under gray Mark Watched.
- Mid-West: Mark Watched enabled.

### 5. Curtain chips
- Live Now (ET) / Live Now (PT) (replace On Air Live ET / On Air · Live PT).

### 6. Post–East Follow along (Option A + Light)
- Soft inset: Draft scores available · may be ahead of you; under Latest: Couple · Dance; CTA Follow along.
- Follow along = full high-water draft unlock (same as East Stay) → amber Draft scores · may change.
- SF-agnostic. When SF on, replaces Spoiler-Free · Week N posting live for that gap.
- Light honesty copy only — no medium/heavy pace-sync.

### 7. Strip coexistence
- Visible draft strip replaces SF posting strip (homeStripChoice). Soft inset Pattern B.

### 8. Parked / out of scope
- Medium/Heavy dance-pace sync; Push Pilot does not ship this eng.
