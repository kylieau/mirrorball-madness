# Session Handoff

## 1. Current State

Docs-only cleanup on latest `main` (after PR #17 Results/Picks carousel and PR #18 sticky bottom nav). Branch `cursor/backlog-carousel-nav-docs-e908`. No UI or code. Do not merge from the agent.

## 2. Changes Made

- `BACKLOG.md` sticky-nav section stays **implemented** (PR #18). Dropped the leftover “episode dropdown same-line layout” out-of-scope line that still read like open work.
- Rewrote **View Results / layout polish**: the fan “dropdown above title” nit is **superseded by EpisodeCarousel**. Admin View Results has no dropdown; Enter Results' episode `Select` is form chrome, not parked.
- Restored **DND / "—" live check** as still owed (code maps `bye` → DND / —; needs a real published Did Not Dance couple — do not invent data).

## 3. Key Decisions & Lessons Learned

- PR #17 replaced fan `WeekSwitcher` with `EpisodeCarousel` under the Results title; do not keep “move dropdown onto the title line” as open work.
- Sticky + content-column width shipped in #18 — backlog must not still say parked / not started.

## 4. Backlog & Deferred Items

- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results (by week and by couple) and public Results. Do not invent a fake production row.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

Sticky bottom nav / content-column width and the fan WeekSwitcher title-line nit are **not** open work.

## 5. Next Steps

1. Merge this docs PR when ready — planning note only, not a product change.
2. Do not merge from the agent.
