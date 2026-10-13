# Session Handoff

## 1. Current State
**Everything shipped; nothing uncommitted of ours.** Local `main` == `origin/main` at `e506707` plus this sync. Deploy not confirmed from here (no dashboard access). Landed 2026-10-13, ahead of S35 E06 (Super Bowl Night, Tue Oct 13, 8pm ET, Joe Buck guest judging):
1. **E06 dances prefilled**: all 11 couples' style + song title (title only, no artist, matching earlier weeks) in `draft_dance_scores`, no judge scores, via `supabase/queries/prefill-s35-e06-dances.sql` the user ran. Couples read In progress; nothing released or live.
2. **Per-episode guest judges** (`e554bd2`, chips fix `e506707`): Schedule's episode sheet has Guest Judges (under Judges' Save Active) with Past Guests chips. `episode_guest_judges` table (`supabase/apply-episode-guest-judges.sql`, applied live). Enter Results shows standing panel + that night's guests. **Joe Buck is booked on E06** (archived `people` row, so never on the standing panel); E05 still shows 3 judges, verified headless.
3. **Scaled judges points** (same commit): `dance_scores.scaled_score` / `draft_dance_scores.scaled_score` = judges' average × 3, written on draft save, publish, per-couple reveal and correction seed (`supabase/apply-scaled-judges-score.sql`, applied live; all 55 live + 58 draft rows backfilled equal to total). Dance Card, roster lines, Couples Leaderboard, draft-night points pay on it; raw `total_score` stays for display and Curtain Call top scorer. Score History shows `Jdg 38→28.5` on a guest night. Types regenerated from live (matched hand edits).
4. Deleted the unused archived judge "test" (no scores, drafts or bookings) with the user's OK.

**Unpushed branch `fixes/finale-bonus-audit-schedule`** (3 commits on top of `origin/main`, no rebase needed as of 2026-10-13; push/merge only when the user says):
- `50ba866` Top-five double elimination: each couple takes the *better* placement in the shared range (user chose this rule), via `finalPlacementFromRange` in `scoring.ts`, used by `results.ts`, Score History and Couples Leaderboard. Semi-final 6→4 double now pays both the 5th-place bonus. Takes effect on next publish; no S35 week needs recompute.
- `af0d8c4` `npm audit fix` (lockfile only). `9c35838` next 15.5.25 → 15.5.27, `shadcn` moved to devDependencies (it's a generator plus a build-time CSS import, like tailwindcss). First deploy on the new Next: watch Vercel go Ready.
- S35 schedule: E08 Horror Movie Night corrected by the user to Tue Oct 27 (ABC listing; it was Wed Oct 28). Live E09 Disney Night is Mon Nov 2 (Election Day bump). `supabase/apply-season-35-schedule.sql` still has the old dates; left stale on purpose, since it skips existing rows.

## 2. Changes Made
All committed and pushed; see above. **Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (separate in-progress iOS work), `.devcontainer/devcontainer-lock.json`. **Ours, uncommitted on purpose:** `supabase/queries/prefill-s35-e06-dances.sql` (one-off, already run; BACKLOG parked nit says delete).

## 3. Key Decisions
- **Curtain Call lock** (user settled 2026-10-07): per-league coast + signed offset, capped at the broadcast's end (user explicitly wanted the cap). Grand Finale deadline stays on East time (user said no). Changing the coast/offset is unguarded and can reopen picks mid-night, same as the old lock-hours setting. West leagues pick after East results exist — accepted, noted in helper text. Details in CLAUDE.md's data-model "Curtain Call lock" bullet.
- **Direct writes past the pick lock are blocked by the safety policy** (service-role insert into `predictions` was denied). For one-off fixes, hand the user a guarded `.sql` block for the Dashboard SQL Editor instead; don't retry the write.
- **Guest judges / scaling** (user settled 2026-10-13): guests are per episode on Schedule (super admin), not on Enter Results; fantasy judges points normalize to a 3-judge basis, Curtain Call top scorer stays raw. Multi-dance nights deliberately not normalized (BACKLOG calibration refit item).
- **Dependency audit (user settled 2026-10-13):** leave Next's bundled `postcss@8.4.31` (2 remaining prod findings; build-time only on repo CSS, no npm `overrides`; clears with Next 16). `@capacitor/cli` ^7 vs core/ios/app/browser ^8 left alone; ask before changing, since `cap sync` belongs to the iOS session. `eslint-config-next` still 15.5.25 (harmless).
- **Curtain Call partial credit is two hardcoded bands, no more** (25/10, settled 2026-10-05). No third band, no commissioner knob.
- **Retroactive scoring changes** go through `scripts/recompute-published-weeks.ts` (`npx tsx --env-file=.env.local`, `NODE_OPTIONS=--experimental-websocket`, project root). Deploy the engine change first, then recompute.
- **Ad-hoc TS scripts with top-level await** must be `.mts` (tsx defaults `.ts` to CJS). Service role can't execute `active_season_id()` or `prediction_lock_at()` — read `seasons.is_active` directly, and call lock RPCs as a throwaway authenticated user.
- **Type regen works here** (`SUPABASE_ACCESS_TOKEN` is in `.env.local`): `set -a; . ./.env.local; set +a` then the CLAUDE.md command. Write to a temp file first and diff — the committed file had drifted from live before this regen.
- **gh CLI**: `GH_TOKEN` from the VS Code git credential helper per command (token lacks `read:org`; plain `gh pr view` fails, `--json`/create/merge/checks/api work). Never persist it to a shell profile from a session.
- **Keep `next dev` running** for the user's VS Code preview pane on localhost:3000; stop it only for `npm run build` (shared `.next`) and restart after.
- **Settled UI calls:** pinned real top bar on every fan tab; light phone frame, page scrolls; gold mirrorball icon; Stay Updated is the only opt-in label; West Stay is published-only; Settings "I last watched" not locked mid-East (BACKLOG item 7).
- **Git:** `git pull --rebase --autostash`; stage by name; commit with a pathspec (the other session's `project.pbxproj` stays dirty).
- **Headless checks:** screenshot kit = seed up → dev server → shoot 360/390 → seed down (layout only, blind to touch feel); for a single page, a throwaway commissioner + `create_league` + playwright, cleaned up in `finally`.
- **`BACKLOG.md` edits:** `Edit` or a targeted script, never `Write`.

## 4. Backlog & Next Steps
- **Tonight (E06):** after the first couple's scores save, check its `scaled_score` (BACKLOG "To check: Schedule settings…" guest-judge item). Confirm the Vercel deploy of `e506707` is Ready.
- **West Coast Air Time: done.** #supportSWEKylie and Pen & Paso (Doble) are West; the user confirmed the other three stay East.
- Deferred work otherwise in `BACKLOG.md` "Up next" and Parked nits (guest-judge follow-ups, dead `computeCoupleWeeklyPoints`).

Next command: none pending (branch awaits the user's push/merge call).
