# Session Handoff

## 1. Current State

**Cross-league picks shipped to `main` (`c8d9fc2`), not yet clicked through in a browser.**
Curtain Call and Grand Finale pick forms now have:
- **Also save to…** — a collapsed "Also save to N leagues ▾" toggle above Save; opens one
  tickable row per other league, each with its own note ("Replaces your current picks",
  "Picks are locked", "<module> is off in this league"). One Save loops the existing submit
  RPCs per league. Only leagues with nothing to replace start ticked; the collapsed line
  adds "· ↻ replaces existing picks" when a ticked league has picks.
- **Use my picks from…** — a select on an *empty* form that pre-fills it from another league.
  Never saves by itself.

No schema change. Everything else is the state left by the prior session (Grand Finale
pinning, Season 35 schedule loaded); no other feature is in flight.

## 2. Changes Made

`git diff --stat 98f44aa HEAD` (this session's code commit, plus this file):
- `src/lib/copy-picks.ts` — **new**: `planDestination`, `defaultSelection`, `isSelectable`,
  `adaptCurtainCallPick`, `adaptGrandFinaleOrder`
- `src/lib/copy-picks.test.ts` — **new**, 14 tests
- `src/lib/other-league-picks.ts` — **new**: `loadOtherLeaguePicks` (viewer's own picks +
  per-league plan)
- `src/components/other-leagues-picker.tsx` — **new**: `AlsoSaveTo`, `UsePicksFrom`,
  `OtherLeagueSaveSummary`
- `src/app/leagues/[id]/predictions/actions.ts` — `submitPredictionToLeagues`,
  `submitGrandFinalePredictionToLeagues` (thin loops over the existing actions)
- `src/components/pick-em-box.tsx`, `src/components/grand-finale-box.tsx` — wire both features
- `src/app/leagues/[id]/page.tsx` — calls the loader, passes `otherLeagues` to both boxes
- `CLAUDE.md` — one bullet describing the feature; `MEMORY_HANDOFF.md` — this file

Uncommitted and not ours: `ios/App/App.xcodeproj/project.pbxproj`, `scratch/` (holds this
session's live test `copy-picks-live.mts` and `vitest.live.config.mts`).

## 3. Key Decisions & Lessons Learned

- **No new SQL.** `submit_prediction` / `submit_grand_finale_prediction` already enforce
  membership, module-on and per-league lock, so the UI only decides what to *offer*. A new
  atomic copy RPC was rejected (would need an owner-run SQL handoff just for atomicity).
- **One-time copy, not a link.** No sync, no new table. Dance Card is deliberately excluded
  (drafts are per-league).
- **Pins and the eligible-couple pool are per viewer, not per league**, so one pinned list
  serves every league; pre-filled Grand Finale orders go through `adaptGrandFinaleOrder`
  (→ `pinEliminatedFirst`). Pinning is still UI-only.
- **Grand Finale no longer locks at first elimination reveal** (built, run live, reversed by
  the user). Its lock is the hard deadline only. A null GF deadline means locked (RPC
  refuses it); a null Curtain Call lock means open. Don't reintroduce an elimination lock.
- **UI iteration:** checkbox list → chips → collapsed toggle with one row per league. The
  user approved the last. The added shadcn checkbox was deleted as unused.
- **`src/lib` value imports must be relative** (`./x`), not `@/…` — Vitest has no alias.
  Type-only `@/` imports are fine.
- **Live integration tests here run through vitest with a config in `scratch/`**:
  `NODE_OPTIONS="--experimental-websocket" npx vitest run --config scratch/vitest.live.config.mts`
  (no tsx runner). It creates throwaway users/leagues on the live project and cleans up in
  `afterAll`; the cleanup was verified. Throwaway-account writes worked from this container.
- **Don't `npm run build` while `next dev` listens on :3000** — use `tsc --noEmit`, eslint,
  `npm test`.
- **Plan mode:** a rejected `ExitPlanMode` means stop; the user may follow with instructions.
- **A parallel session shares this tree.** Stage by name; never `git add -A`.
- **Re-read live data before acting on an earlier read**; schema/RPC changes go to the user
  as plain `.sql` files.

## 4. Backlog & Deferred Items

- **Browser click-through of both features** is unverified (the RPC and loader layers were
  verified live; the forms were only type/lint/unit checked).
- Possible tweak: the row notes are long on narrow phones — shorten to "Off" / "Locked" if
  cramped. Also possible: name the ticked leagues in the collapsed line, or default to zero
  ticked.
- Copy only happens from the edit form; pushing already-saved picks needs Edit → Save.
- The DB doesn't check that a picked couple is still active (only the picker does).
- **Site Admin visibility** (next planned task): `/admin/results` opens to any signed-in user
  when `RESULTS_ENTRY_OPEN_TO_ALL=true` but is linked only from `SiteAdminNav`;
  `/admin/accounts` is strictly super-admin.
- **Assumed schedule dates** (editable on Admin > Schedule): Week 5 Oct 13, Week 10 Nov 17,
  Week 11 Nov 24; Week 5 has no theme.
- Spoiler-Free callout on `/today` still to be confirmed. Server-side Grand Finale pin
  enforcement deferred. Monte Carlo re-run against real Season 35 data once more weeks exist;
  `dance_card_calibration` clamp path never exercised live.

## 5. Next Steps

1. Run `git status` and `git fetch && git log HEAD..origin/main --oneline` first.
2. Click through both features in a signed-in browser with a user in ≥2 leagues: Save with
   another league ticked, the collapsed/expanded toggle, "Use my picks from…" on an empty
   form, and a locked or module-off league. Fix anything found.
3. Then start **Site Admin visibility**. Recommendation: a read-only public Schedule (episodes
   by week, themes, air times) linked from the Home episode banner, not under `/admin`. Skip a
   public View Results. Keep Accounts, the Settings tab and Enter/Publish Results gated; later
   replace `RESULTS_ENTRY_OPEN_TO_ALL` with a per-person "results editor" flag on `profiles`
   (a column users can't write, per the column-grant rule in `CLAUDE.md`).
