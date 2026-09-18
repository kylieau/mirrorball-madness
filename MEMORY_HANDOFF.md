# Session Handoff

## 1. Current State

Draft PR #22 off latest `main`: Recast/waivers spoiler framing + fan roster-eliminated clamp. Branch `cursor/recast-spoiler-roster-clamp-5a33`. Do not merge from the agent.

## 2. Changes Made

- Recast nudge (`RecastNudgeCard`) and `/leagues/[id]/waivers` no longer key copy off raw `eliminated`/`withdrawn`. `partitionRecastSlots` / `classifyRosterOccupancy` (`src/lib/recast-framing.ts`) split revealed vs hidden open slots using `spoilerSafeCoupleStatus` + `resolveSpoilerCutoff`.
- Unrevealed open slots: vague `RecastCatchUpCard` (“you may have an open spot”) + Mark as watched. No `formerCoupleName`, no “is out”, no recast pool. Revealed slots / Spoiler-Free off: existing claim UI unchanged.
- Fan roster weekly tag/points go through `clampRosterCoupleForWeek` — revealed elims keep going-home-week points, later weeks zero. Pick 'Em and the waiver wire use `isSpoilerSafeActive` so an unrevealed elim stays in the pool and a revealed one does not.
- Docs: `CLAUDE.md` data-model bullet, `BACKLOG.md` implemented section, README Phase 7 note. Removed the outdated “Recast framing is out of scope for v1” comment.

## 3. Key Decisions & Lessons Learned

- Vague catch-up card rather than hiding Recast entirely — users still get a path to mark as watched without learning who went home.
- Never use hidden-open count in copy (would leak a double-elim). Always singular “an open spot”.
- Do not invent a second spoiler system; occupancy is just `spoilerSafeCoupleStatus` interpreted as open vs occupied.
- Draft room was investigated and left alone: it lists the season pool without status (pre-season). No mid-season draft filter added.

## 4. Backlog & Deferred Items

- League-wide miss-rate board and bottom-two / “almost had it” remain out of scope for Past picks.
- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results and public Results. Do not invent a fake production row.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Feature-announcement infra.
- Recast/waivers spoiler framing; roster-eliminated clamp — done (this PR).
- `/notifications` `rankBadge` leak — done (PR #21).

## 5. Verification

- `npm run lint` — pass
- `npm test` — 20 files / 185 tests pass (added `recast-framing` + clamp / `isSpoilerSafeActive` cases)
- `npm run build` — pass
- No live browser pass: this container has no `.env.local`. Phone-review notes are below for a real session.

## 6. Phone review — Picks Recast

**Spoiler-Free ON, latest elim week not marked watched**
- Roster: gone couple still looks Safe, last-watched week’s points (not Eliminated).
- Recast: “You may have an open spot” — no name, no “is out”, no Browse recast pool. Mark as watched is present.
- Pick 'Em (upcoming week): that couple still in the dropdowns (does not vanish).
- `/leagues/[id]/waivers`: same catch-up card; no `Slot N (Former Name)`; wire list does not drop an unrevealed unrostered elim.

**Spoiler-Free ON, then Mark as watched (or already caught up)**
- Catch-up card → full Recast (“one of your couples is out”, former name, Browse recast pool / claims).
- Roster tag → Eliminated; later weeks show +0 this wk.
- Couple drops out of Pick 'Em and the waiver wire.

**Spoiler-Free OFF**
- Immediate full Recast with names. Roster clamp same as revealed. Claim mechanics unchanged.

**Mixed (older revealed open slot + newer unwatched elim)**
- Recast names only the revealed slot. Does not mention the hidden one.

## 7. Next Steps

1. Phone-review Recast on Picks with Spoiler-Free on vs off (notes above).
2. Merge this PR when ready.
3. Do not merge from the agent.
