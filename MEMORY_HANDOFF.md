# Session Handoff — 2026-11-03 (morning after E09)

## 1. Current State

**`main` is at `5e71558` (PR #57), pushed and deployed.** Local `main` was 24 behind and has been fast-forwarded. Nothing from this session is uncommitted except this handoff and BACKLOG.md.

What landed since the last handoff (all 2026-11-02, Cursor Agent / grokbot sessions, Kylie co-author):
- **Dance Card pays once per night** (`ef2e6eb`…`36c4946`): `collapseToNights` combines a couple's marks over the combined max. Results cards show each dance plus `Night 64/80`.
- **Special Dances** (`dbdb2c9`…`0c5b5a6`): team/trio/dance-off/marathon entries are their own entity on `episode_teams`, set up inline on Enter Results (`SpecialDanceEntry`). Posting writes `team_id`-tagged `dance_scores` per member. Full description is in CLAUDE.md's Special Dances bullet.
- **PR #56 (`584ac07`)**, picker tweaks: Special Dances group sits below Couples, sorted A–Z, members on one Oxford-comma line, no "X of 4 judges in" count.
- **PR #57 (`5e71558`)**, polish: marks are `MARK_MIN = 1` to max in 0.5 steps (inline error blocks autosave/Done/Publish); special-dance saves no longer create a week draft in the client; couples eliminated before the week are filtered from member pickers; Remove asks first; mark grid stacks under 420px and "+ Fantasy Bonus" moves under the name below 480px; the Didn't Judge toggle on specials was dropped; the PGlite live-row order flake is fixed. A merge conflict in `special-dance-entry.tsx` was resolved by hand to keep both #56 and #57. **Not yet reviewed by Claude.**

Live database, verified read-only with the service role this morning:
- `apply-special-dances.sql` **is live** (`episode_teams.scoring_mode` exists, so `teamsMode` is `special`). CLAUDE.md still says it isn't, which is stale.
- `apply-special-dances-polish.sql`: grokbot reports it **applied live**, but the file header still reads "UNAPPLIED. Do not run…". Function bodies can't be read through PostgREST, so this is unconfirmed from here.
- **E08 published** 2026-10-28 06:13Z. Runbook step 8 passes: 25 Week 7 score rows, one per team in every real league (Kylie's Test League is `not_started` and has never had rows); 0 releases; E08 outcomes 8 safe / 2 eliminated; season now 8 eliminated / 8 active. E07 and E08 each still hold 10 `draft_dance_scores` rows, likely correction seeds from opening the published week in Enter Results (not checked further).
- **E09 (Week 8, Disney Night) aired 2026-11-02 and is not published.** 8 drafts, 0 releases, 0 live rows, two marks-mode special dances (Wildcats, Slaytopia), 1 `draft_episode_overrides` row.

## 2. Changes Made

This session: `MEMORY_HANDOFF.md`, `BACKLOG.md` only (plus the fast-forward).

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`: Kylie's machine-only Codex SSH setup.
- `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/*.sql` one-offs (E06–E08 prefills, `add-bryan-s35-w05/w07-curtain-call.sql`).

## 3. Key Decisions
- **Special dances are entities, never couples**; drafts never hold special-dance rows, and a couple posts its own dances independently of any special it's in. Didn't Judge on specials was dropped by Kylie (#57); don't re-add it.
- **Dance Card is per night**, not per dance. `apply-strong-play-ceilings.sql` predates that and is historical; never rerun it.
- **Curtain Call timing is the commissioner's call, any time** (2026-10-27). The app only warns; don't re-add a server guard.
- **Double elimination flag:** flip `is_double_elimination_week` only when announced, before the lock. Home's picks-due check ignores slot 2.
- **Prefill format:** draft-only `draft_dance_scores` rows, skip couples that already have one; song title `Song (Movie)`, no quotes.
- **Deploy approval:** a push to `main` deploys production and needs Kylie's explicit yes in that turn (handoff syncs excepted).
- **QA against production:** `seed.mjs` QA-domain accounts only, always finish with `seed.mjs sweep`. Production deletions: hand Kylie a guarded `.sql` (exact-count `raise exception`).
- **Ad-hoc service-role checks:** script at the project root, `.env.local` sourced, `NODE_OPTIONS=--experimental-websocket`, delete afterwards. `prediction_lock_at` returns null to the service role.
- **Never `pkill -f`.** Stop a server by the pid from `ss -ltnp`.
- **Unchanged:** the late Grand Finale air-to-publish pause stays; rehearse SQL in a rolled-back transaction; never ask for the DB password; throwaway accounts only, never fake releases or `dance_scores`; run tests as `npx vitest run src`; stage by name; attribution `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. `SUPABASE_ACCESS_TOKEN` in `.env.local` is expired (401).

## 4. Backlog & Next Steps
See BACKLOG "Special dances follow-ups — 2026-11-03" (review items grokbot flagged, stale docs) and the older E08 / QA / audit sections.

**First:** review #56 + #57 on `main` before E09 is finished:
1. Run `npx vitest run src`, `npm run lint`, `npm run build`.
2. Read the `special-dance-entry.tsx` conflict resolution: both #56's picker tweaks and #57's polish present.
3. Search for any remaining path that creates a week draft (`flushDraft`, `setHasDraft`, `draft_episode_overrides` inserts) from a special-dance save.
4. Confirm the 1-to-max, 0.5-step rule matches between `team-dances.ts` (`MARK_MIN`, `isHalfStep`) and `check_team_mark` / `save_team_marks` in `apply-special-dances-polish.sql`, including half points.

**Then:** E09 publish (Kylie), and runbook step 8 for E09 with the service role.

Next command: `npx vitest run src`
