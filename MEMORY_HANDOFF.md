# Session Handoff

## 1. Current State
**Everything shipped; nothing uncommitted of ours.** Local `main` == `origin/main` at `0014a31` plus this sync, production deploy green. Landed 2026-10-07:
1. **West Coast / after-curtain Curtain Call lock** (`95bd384`): League Settings → Curtain Call → Scoring Details now has **Air Time** (East Coast 8pm ET / West Coast 8pm PT, default East for every league) and **Pick 'Em Lock** as hours Before/After the Curtain, with a "Week N locks/locked …" preview. `prediction_lock_at` = the week's first night on the league's coast minus a signed offset, capped at the end of that broadcast (`duration_minutes`). SQL applied live by the user (`supabase/apply-west-coast-pick-lock.sql`); types regenerated. Live RPC verified against `curtainCallLockAt` for 21 East/West × before/after × cap cases (scratch league, cleaned up); settings controls screenshotted, no console errors. Home banner now keys "Picks Locked" off the *latest* lock across the viewer's leagues and reads "Picks Still Open · Time to Vote" on air while one is open. No league has been switched to West yet — the user (commissioner) will do that in the UI.
2. **Seed script fix** (`0014a31`): `scripts/qa-screenshots/seed.mjs` skips its Curtain Call pick when the next unpublished week is already locked (it used to throw mid-build and strand a scratch league).
3. **Bryan's late Week 4 pick** (league "matt with the stars"; elim Guillermo & Witney, high Amber & Pasha) — inserted by the user via SQL I handed over; confirmed present. It scores when Week 4 (Mariah Carey Night, aired Tue Oct 6) is published.

Earlier and still live: top-scorer within-2 band (25% within 1, 10% within 2, applied retroactively, `7b2cf9a`); PR #52 touch pass merged (phone feel-check is casual, BACKLOG item 8).

## 2. Changes Made
All committed and pushed; see above. **Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (separate in-progress iOS work).

## 3. Key Decisions
- **Curtain Call lock** (user settled 2026-10-07): per-league coast + signed offset, capped at the broadcast's end (user explicitly wanted the cap). Grand Finale deadline stays on East time (user said no). Changing the coast/offset is unguarded and can reopen picks mid-night, same as the old lock-hours setting. West leagues pick after East results exist — accepted, noted in helper text. Details in CLAUDE.md's data-model "Curtain Call lock" bullet.
- **Direct writes past the pick lock are blocked by the safety policy** (service-role insert into `predictions` was denied). For one-off fixes, hand the user a guarded `.sql` block for the Dashboard SQL Editor instead; don't retry the write.
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
- **User action pending:** publish Week 4 (scores Bryan's pick); flip any West Coast leagues' Air Time in League Settings.
- Stranded scratch league from an Oct 5 seed run (`cfa75bd2…`, "Carrie Ann's Unbelievably Long…") and its 4 `qa-*@mirrorball-test.local` users: deleted 2026-10-07 with the user's OK. Live leagues are now only the user's five real ones.
- Deferred work otherwise in `BACKLOG.md` "Up next".

Next command: none pending.
