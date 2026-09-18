# Session Handoff

## 1. Current State

Draft PR off latest `main`: Recast/waivers spoiler framing + fan roster-eliminated clamp. Branch `cursor/recast-spoiler-roster-clamp-5a33`. Do not merge from the agent.

## 2. Changes Made

- Recast nudge (`RecastNudgeCard`) and `/leagues/[id]/waivers` no longer key copy off raw `eliminated`/`withdrawn`. `partitionRecastSlots` / `classifyRosterOccupancy` (`src/lib/recast-framing.ts`) split revealed vs hidden open slots using `spoilerSafeCoupleStatus` + `resolveSpoilerCutoff`.
- Unrevealed open slots: vague `RecastCatchUpCard` (“you may have an open spot”) + Mark as watched. No `formerCoupleName`, no “is out”, no recast pool. Revealed slots / Spoiler-Free off: existing claim UI unchanged.
- Fan roster weekly tag/points go through `clampRosterCoupleForWeek` — revealed elims keep going-home-week points, later weeks zero. Pick 'Em and the waiver wire use `isSpoilerSafeActive` so an unrevealed elim stays in the pool and a revealed one does not.
- Docs: `CLAUDE.md` data-model bullet, `BACKLOG.md` implemented section, README Phase 7 note. Removed the outdated “Recast framing is out of scope for v1” comment.

## 3. Key Decisions & Lessons Learned

- Vague catch-up card rather than hiding Recast entirely — users still get a path to mark as watched without learning who went home.
- Never use hidden-open count in copy (would leak a double-elim). Always singular “an open spot”.
- Do not invent a second spoiler system; occupancy is just `spoilerSafeCoupleStatus` interpreted as open vs occupied.

## 4. Backlog & Deferred Items

- League-wide miss-rate board and bottom-two / “almost had it” remain out of scope for Past picks.
- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results and public Results. Do not invent a fake production row.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Feature-announcement infra.
- Recast/waivers spoiler framing; roster-eliminated clamp — done (this PR).
- `/notifications` `rankBadge` leak — done (PR #21).

## 5. Verification

- Pending this turn: lint, unit tests, build, phone-review notes for Spoiler-Free on vs off on Picks Recast.

## 6. Next Steps

1. Phone-review Recast on Picks with Spoiler-Free on (unwatched elim week) vs off / marked watched.
2. Merge this PR when ready.
3. Do not merge from the agent.
