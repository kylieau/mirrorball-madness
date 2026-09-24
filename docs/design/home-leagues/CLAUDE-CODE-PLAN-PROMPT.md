# Paste into Claude Code — PLAN only (do not implement yet)

Copy everything below the line into Claude Code as the planning prompt. Attach the four PNGs from `pngs/` (or point Claude at this folder if the pack is in the repo under `docs/design/home-leagues/`).

---

## Goal
Write an implementation **plan** (not code yet) for Mirrorball Madness Home + Your Leagues triage, matching the locked UX below and the attached mocks. Explore the live codebase, map files/components/data already used by Home and league navigation, call out gaps and risks, and propose a phased ship plan with acceptance checks. Stop after the plan unless I explicitly say to implement.

## Product context
Fantasy DWTS app. Dark ballroom UI. Home is triage: what needs picks, where you stand, jump into a league. Most users have **one** league; multi-league is the edge case that makes See All matter.

## Locked UX (do not reopen)

### A. Curtain banner on Home
- Curtain must lead with **status copy** (title + sub), not week dots alone.
- Week progress rail stays **quiet secondary** under the status copy.
- Chip/sticky: `Week N · {status}`.
- Keep existing theatrical curtain chrome; change hierarchy so status wins.
- Status state machine + West overlays are already product-locked — implement against current `episode-banner` / competition-week logic; do not invent a new status set. Key files to find: `episode-banner.tsx`, `episode-banner.ts`, `competition-week.ts` (names may vary — search).
- West etiquette (global): ~7–8pm PT `West feed at 8pm` / `Spoilers can wait`; 8–10pm PT `West Coast is watching` / same sub; then Results in. Wins over Results soon/Results in for **copy**. Fixed Pacific wall clock for “8pm” in West feed title.

### B. Home — Your Leagues list
- Rows stay **compact**: name, `Rank X of Y · pts`, pill `Picks Due` | `All caught up`.
- **No** per-row accordion on Home.
- **No** mute triage subtitle under every Home row (would often duplicate).
- Keep shared countdown (`Picks close in …`) + single Make picks card for the league that needs action when that pattern already exists.
- `See All ›` opens the richer Leagues page.

### C. Your Leagues (See All) page
- Richer **cards** with per-league triage preview:
  - Module status line (can differ): e.g. `Week 3 · Dance Card still open`, `All modules locked`, `Curtain Call locked`
  - Week point delta (`+12 this week` or `—`)
  - Due league: stronger chrome + `Make picks ›`
- Optional **expand only here** (not on Home), especially for Picks Due: What’s due (Dance Card / Curtain Call / Grand Finale states) + closes-in + Make picks + Standings link.
- Do **not** put mini leaderboards, peer Dance Cards, Score History, or elim spoilers on these cards.

### D. Tap routing (need-based) — ship this
- From Home row **or** See All card:
  - `Picks Due` → navigate to **Picks** for that league
  - `All caught up` → navigate to **Standings** for that league
- Today may always go to Standings — change to need-based.
- Defer a full “league hub” sheet unless planning notes it as a later phase.

## Visual refs (attached / pack)
1. `01-curtain-status.png` — Home target hierarchy  
2. `02-leagues-triage.png` — See All default cards  
3. `03-leagues-expand.png` — See All expand on due league  
4. `04-tap-destinations.png` — tap options; ship **C**  
5. `ref-live-home.png` — current live baseline (pack root)  

Also read `00-LOCKED.md` in this folder (`docs/design/home-leagues/00-LOCKED.md`).

## What I need from you (plan deliverable)
1. **Current-state map** — Home tab, curtain/banner, Your Leagues list, See All route (if any), how league tap sets active league + tab today.
2. **Data needed for triage lines** — what APIs/selectors already expose module open/locked (Dance Card, Curtain Call, Grand Finale), week deltas, picks-due per league; what’s missing.
3. **Proposed file/component changes** — list concrete files; prefer extending existing components over greenfield.
4. **Phased plan**  
   - P0: need-based tap + curtain status hierarchy (if banner states already exist, hierarchy/layout only)  
   - P1: See All triage cards  
   - P2: optional expand on due card  
5. **Risks / edge cases** — one league only; all caught up; CC-off leagues; multi-night weeks; West overlay vs picks-open; empty week delta.
6. **Acceptance checklist** matching locked UX.
7. **Out of scope** list so we don’t creep into Score History / League at a Glance / Standings Dance Cards.

## Constraints
- Match existing dark ballroom design tokens; don’t redesign the whole Home.
- Spoiler-safe: no elim spoilers in new Home/See All copy.
- Plan first; wait for my OK before coding.
- If anything in the mocks conflicts with live schema, flag it and propose the closest existing field — do not invent fake backend fields as if they were real.

## Success for this planning turn
A clear phased plan I can approve, with file pointers and acceptance checks, ready for a follow-up “implement P0” message.
