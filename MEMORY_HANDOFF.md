# Session Handoff

## 1. Current State

Docs-only on latest `main` (after PR #19 backlog cleanup). Branch `cursor/drop-spectator-backlog-f31b`. Owner decision: spectator role is no longer needed. Do not merge from the agent.

## 2. Changes Made

- `BACKLOG.md` Past picks section: dropped spectator from “Out of scope (still)”. One-liner left: won’t do / no longer needed.
- `CLAUDE.md` / `README.md` did not list spectator as planned work — no change. (`league_members.role` still only `'commissioner'` / `'manager'`; that is a data-model fact, not a spectator teaser.)

## 3. Key Decisions & Lessons Learned

- Spectator is not deferred work and not “out of scope still” — do not re-add it as a future feature.

## 4. Backlog & Deferred Items

- League-wide miss-rate board and bottom-two / “almost had it” remain out of scope for Past picks.
- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results and public Results. Do not invent a fake production row.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

## 5. Next Steps

1. Merge this docs PR when ready — planning note only, not a product change.
2. Do not merge from the agent.
