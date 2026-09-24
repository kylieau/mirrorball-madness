# Home / Your Leagues — Locked direction (2026-09-24)

**App:** Mirrorball Madness  
**Surfaces:** Home tab curtain + Your Leagues list; **Your Leagues (See All)** list page  
**Status:** Design locked for Claude Code planning (Kylie approved direction)

## Locked decisions

### 1. Curtain = status first, week rail secondary
- Curtain title + sub carry the **actionable episode/status copy** (existing rotating status system).
- Week progress dots stay as a **quiet secondary rail** under that copy (do not lead with dots alone).
- Sticky/chip form: `Week N · {status}` (e.g. `Week 3 · Picks open`).
- Retain locked West etiquette overlays when they fire (see § Curtain states).

### 2. Home Your Leagues rows stay compact
- No accordion / collapsible on every Home league row.
- No mute triage line under every row when it would read the same for all caught-up leagues.
- Keep: name, rank · pts, status pill (`Picks Due` / `All caught up`).
- Keep shared countdown + single Make picks card for the league that needs action.
- Identical `All caught up` pills are fine (most users have one league).

### 3. Richer triage lives on See All (`Your Leagues` page)
- Opened via Home `See All ›`.
- Cards (not tiny rows) preview per-league triage:
  - Rank · pts
  - Status pill
  - Module status line (may differ per league), e.g. `Week 3 · Dance Card still open` / `All modules locked` / `Curtain Call locked`
  - Week delta (`+12 this week` or `—`)
  - Due card: raised / gold edge + `Make picks ›`
- Optional expand **only on See All**, primarily for the due league: What’s due checklist (Dance Card / Curtain Call / Grand Finale) + closes-in + Make picks / Standings.

### 4. Tap destination = need-based (C)
- **Picks Due** → open **Picks** for that league  
- **All caught up** → open **Standings** for that league  
- Applies to Home compact rows **and** See All cards.
- Reject always-Standings (A) once triage exists.
- League hub sheet (B) deferred; only if a real league home is wanted later.

## Out of scope (this package)
- Mini leaderboards, peer Dance Cards, Score History, elim spoilers on Home or See All cards.
- Rebuilding Picks League at a Glance / Score History / Standings Dance Cards.
- Logo / brand work.

## Design refs (local pack)
| File | Meaning |
|------|---------|
| `pngs/01-curtain-status.png` | Home with status-in-curtain |
| `pngs/02-leagues-triage.png` | See All triage cards (default density) |
| `pngs/03-leagues-expand.png` | See All expand on due league |
| `pngs/04-tap-destinations.png` | A/B/C tap compare — ship C |
| `ref-live-home.png` | Pre-change live Home |

---

## Curtain states (carry forward — already locked)

**Clocks:** Lock / on-air / scoring = East live (`airs_at` = 8pm ET / 5pm PT). UI times in viewer local zone. West delay does **not** move lock/on-air.

**Driver episode:** Earliest unpublished episode in first incomplete week.

**Picks lock:** CC on → earliest `prediction_lock_at` among user’s CC-on leagues; CC off → `airs_at`; hide picks-oriented copy if CC off.

**On-air window:** `airs_at` → `airs_at + duration` (~2h default).

| State | Title | Sub | Sticky / chip |
|-------|-------|-----|----------------|
| Picks open | Picks open | Airs {local} | Week N · Picks open |
| Locked pre-air | Picks open | Picks locked · Airs {time} | Week N · Picks locked |
| On Air Now (+ red dot) | On Air Now | Picks are locked | Week N · On air |
| Results soon | Results soon | Scores post after the show | Week N · Results soon |
| Results in | Results in | Standings are updated | Week N · Results in |

**West overlays (global; win over Results soon/Results in for copy):**
| Window (PT) | Title | Sub | Sticky |
|-------------|-------|-----|--------|
| ~7–8pm | West feed at 8pm | Spoilers can wait | Week N · West feed 8pm |
| 8–10pm | West Coast is watching | Spoilers can wait | Week N · West feed on |
| After 10pm PT | fall back to Results in | | |

No spoiler-free pitch in banner. Results in after week-complete publish held until `next.airs_at − 48h` (shorten/skip if next air sooner).
