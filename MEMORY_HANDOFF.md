# Session Handoff

## 1. Current State

**Grand Finale picker fixes — shipped on `main` at `74e8193`, nothing in flight.**
Investigated a report that the Grand Finale list still showed already-eliminated
couples (16 listed vs "14 left" on Curtain Call). Outcome:
- Listing all 16 is **by design**: it's a full-order ranking of the whole cast;
  `submit_grand_finale_prediction` requires every season couple exactly once and
  scoring resolves each couple against its actual position.
- The real problem was that the picker stayed editable after eliminations aired
  (deadline = hard-deadline week, `judges_score_starts_week` = 2 in two leagues).
- Final behaviour: picking stays open until the hard deadline; couples whose
  elimination is already *revealed* to the viewer are pinned first and immovable,
  so the viewer ranks only the still-competing couples.
- Selection step redesigned: "your order so far" list on top, remaining couples in
  a 2-column grid of full-width buttons (16 couples = 8 rows) instead of wrapped bubbles.

## 2. Changes Made

`git diff --stat 9fe610b HEAD` (this session's commit `74e8193`):
- `src/components/grand-finale-box.tsx` — pinning wired in, 2-column selection grid
- `src/lib/grand-finale-pins.ts` — **new**: `pinnedEliminatedIds`, `pinEliminatedFirst`
- `src/lib/grand-finale-pins.test.ts` — **new**, 4 tests
- `supabase/revert-grand-finale-lock.sql` — **new**: restores the original
  `effective_grand_finale_deadline` (already run by the user)
- `CLAUDE.md` — Grand Finale bullet describes pinning (not a lock)

Uncommitted and not ours: `ios/App/App.xcodeproj/project.pbxproj`, `scratch/`.

## 3. Key Decisions & Lessons Learned

- **A lock was built, run live, then reversed.** The user first chose "lock at
  first reveal", I shipped it as SQL, they ran it, then decided Grand Finale
  *shouldn't* lock and chose "stay open, pin eliminated couples". Don't reintroduce
  an elimination-based lock. `schema.sql` never kept it (reverted); the live DB was
  restored via `revert-grand-finale-lock.sql`.
- **Pinning is UI-only.** The RPC can't enforce it without knowing each viewer's
  spoiler progress, so a direct API call can still move a pinned couple. Unrevealed
  eliminations are deliberately not pinned (spoiler safety, via `spoilerSafeCoupleStatus`).
- **Same-week eliminations** are pinned in name order; scoring gives both the same
  actual position, so points are unaffected.
- **Eliminated status is only shown on the saved/locked summary**, never in the
  select step — "preview doesn't show eliminated couples" is expected, not a bug.
- **Service role cannot call `effective_grand_finale_deadline`** (revoked from public,
  granted to `authenticated` only) — verify deadline logic from the underlying tables
  or a signed-in session, not by RPC with the service key.
- **A parallel session swept my uncommitted `CLAUDE.md` edit into its commit
  `c2da7d7`.** Stage by name; check `git log -- <file>` if a diff looks odd.
- **Don't `npm run build` while `next dev` listens on :3000** — use `tsc --noEmit`,
  eslint and `npm test`.
- **Live DB writes are blocked from this container** — hand over plain `.sql` files
  for the Supabase SQL Editor, verify with read-only service-role `.mjs` scripts run
  from the project root with `NODE_OPTIONS="--experimental-websocket"`.

## 4. Backlog & Deferred Items

- The new selection layout and pinning have **not been eyeballed in a browser**
  (only typecheck, lint, 232 tests). Check phone width: 2 columns, long "A & B"
  names wrap, pinned rows show no arrows, "Edit order" re-pins a stale saved ranking.
- Optional hardening: server-side pin enforcement would need per-user spoiler
  progress in the DB; currently deferred.
- Episode 4 in live data has placeholder theme "test" (`airs_at` 2026-09-21) in its
  own week — likely leftover test data; check before it becomes the live week.
- Still owed from earlier sessions: eyeball quieter deadline stubs and Spoiler-Free
  callout on `/today`; browser click-through of Settings Placement Bonus fields and a
  live Curtain Call pick; re-run the Monte Carlo calibration against real Season 35
  data (`scripts/monte-carlo-calibration/README.md`); `dance_card_calibration`
  clamp path (roster size outside 1-6) never exercised live.

## 5. Next Steps

1. Run `git status` and `git fetch && git log HEAD..origin/main` first — a parallel
   session shares this tree.
2. Load a league's Picks tab with Grand Finale on and click through the select →
   reorder → save flow at phone width (backlog item 1). Fix any layout issue found.
3. Otherwise wait for the next request.
