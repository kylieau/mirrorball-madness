# Session Handoff — 2026-11-05 (episode rounds shipped, before E10)

## 1. Current State

**`main` is at `5e904be`, pushed.** Nothing of ours is uncommitted. E10 (Week 9, Grammy Night) airs **Tuesday 2026-11-10, 8pm ET** (`airs_at` 01:00Z Nov 11).

Shipped and pushed this session:
- **Episode rounds** (`36d443c` … `5e904be`). Edit Episode's "Dance Rounds For This Episode" replaces Dances (Per Couple) and Round Types. Enter Results gets round tabs, planned-heat placeholders, a Not in This Round band, Mark an Exception, and an on-air Winner's Bonus. See CLAUDE.md "Episode rounds".
  - `supabase/apply-episode-rounds.sql` is **applied live and verified**: `supabase/queries/verify-episode-rounds.sql` returned 3 tables, 2 columns, 12 functions and 0 episodes without a plan. Types are regenerated.
  - E09 is Round 1 + Team Dance (Wildcats 1, Slaytopia 2). E10 is Round 1 + Dance-Off (Dance-Off 1–3, Winner's Bonus, points mode). No hand-made Immunity special existed.
  - Kylie's click-through on production (Edit Episode save with Harry & Jenna Immune on E10) passed.
  - **UI pass** (`330143e`) after a Codex + advisor review: app chips, standard type scale, plain Labels, neutral badges, stacked bonus fields with errors, one compact exception action, and Undo errors shown in place.
  - **Rounds as underlined base-nova Tabs** (`5e904be`), so they no longer look like the status chips.
- **Retired special-dance leftovers** (`5b5d981`): `TeamEntry` and the inferred mode (now `"none"`), the per-dance panel/Out-of/Theme/Artist columns and the custom-moment tables are gone. `apply-retire-special-leftovers.sql` is applied and verified.
- **Publish Results bar** pinned to the bottom edge (`2254e75`); it floated 80px up for an admin tab bar that no longer exists.
- **Standings**: undrafted couples' points are no longer italic (`0ffdcaf`); the runbook names E08's guest judge.

## 2. Changes Made

All committed and pushed. This sync touches only `MEMORY_HANDOFF.md` and `BACKLOG.md`.

**Not ours; leave unstaged:** `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`, `ios/App/App.xcodeproj/project.pbxproj`, `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`. `npm run lint` errors come from `.codex-private/` (not ours); `npx eslint src` is clean.

## 3. Key Decisions

- **Settled by Kylie 2026-11-05:**
  - **Rounds plan:**
    - round order is the order rounds are added (no reordering);
    - only a site admin edits the plan on Edit Episode, while contributors pair or set up heats and mark exceptions on Enter Results;
    - Immune also ticks Finish Week's Immunity box;
    - swapping heat partners after marks warns but is allowed.
  - **Scoring:**
    - per-couple Judges' Marks heats (`couple_marks`, `PLAN_VERSION = 3`) were built now;
    - elimination-only rounds (`none`) exist and never score.
  - **E10:**
    - dance-offs are a Winner's Bonus round (winner = the round's bonus, loser 0);
    - the bonus stays blank until announced, which holds Finish Week.
  - **Look:** rounds are tabs and the In progress / Drafted / Published chips are the filter (she liked the UI pass).
- **SQL ships before the app that reads it.** Additive SQL first, verified with a read-only query, then push. A push to `main` needs Kylie's yes in that turn (handoff syncs excepted).
- **Production reads through the Management API are now blocked here** (auto-mode classifier, after Kylie's "don't touch the production database directly"). Ask Kylie to run a read-only `.sql` instead. `npx supabase gen types` still works.
- **Fallback for E10:** redeploying `b3ab890` works against the new SQL as long as no `couple_marks` heat exists.
- **Rehearsal:** the PGlite stacks in `retire-special-leftovers-db.test.ts` / `episode-rounds-db.test.ts` (`LIVE_STACK`) reproduce live function bodies exactly; rewrite RPCs from live definitions, not `schema.sql` (which lags behind the `apply-*` files).
- **Unchanged:**
  - SQL goes to Kylie as `.sql` files, rehearsed in PGlite;
  - throwaway accounts only, with POSTs aborted on real episodes (`scripts/qa-screenshots/seed.mjs up|down`, temp scripts in the project root, deleted after);
  - stage by name;
  - attribution `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - never `pkill -f`;
  - `rm -rf .next` before `npm run dev` after a build;
  - a `next/font` build error is a network flake, so retry.

## 4. Backlog & Next Steps

See BACKLOG "Episode rounds — 2026-11-05":
- **Still to see with a real write:** Winner's Bonus on E10 night, Undo, a placeholder heat set up on air, and a `couple_marks` heat.
- **Also listed there:**
  - the two-step Schedule save;
  - the Immunity wording on Home;
  - Points rows wrapping at 360px;
  - the Tabs override note.

The "Special dances follow-ups" section still holds the E10 watch list.

Next: Kylie confirms Vercel shows `5e904be` Ready. On E10 night she enters the Winner's Bonus on the Dance-Off tab once announced, picks Winner/Loser per heat, then runs Finish Week; afterwards run the runbook step 8 checks for E10 (ask Kylie to run them, since reads are blocked here).

Next command: none pending.
