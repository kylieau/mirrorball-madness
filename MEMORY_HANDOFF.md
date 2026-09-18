# Session Handoff

## 1. Current State

Docs-only on latest `main` (after PR #23). Branch `cursor/expand-auto-draft-notes-f840`. Expanded the parked **Draft / auto-draft** backlog item with Chief Kimo’s design notes. Still owner-noted / not started. Do not merge from the agent. Do not implement from this note.

## 2. Changes Made

- `BACKLOG.md` **Draft / auto-draft**: kept owner-noted / parked. Added triggers (never joined vs timeout + optional sit-out/autopilot), eligible-remaining-only random, draft-log labeling, commissioner undo as nice-to-have, no silent snowball, no auto-start unless the league voted that, and later niceties (nudge, half-league pause, seeded RNG).

## 3. Key Decisions & Lessons Learned

- Random-only stays the constraint: no ADP/rankings/team-needs. Park only — do not start auto-draft work from this note.

## 4. Backlog & Deferred Items

- **Draft / auto-draft** — owner-noted, not started (this PR). Design notes parked with the item.
- League-wide miss-rate board and bottom-two / “almost had it” remain out of scope for Past picks.
- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results and public Results. Do not invent a fake production row.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Feature-announcement infra.
- Recast/waivers spoiler framing; roster-eliminated clamp — done (PR #22).
- `/notifications` `rankBadge` leak — done (PR #21).

## 5. Next Steps

1. Merge this docs PR when ready — planning note only, not a product change.
2. Do not merge from the agent. Do not implement auto-draft from this note.
