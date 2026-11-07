# Session Handoff — 2026-11-07 (Finish Week guard + couple links shipped, before E10)

## 1. Current State

**`main` is at `eeb0bc6`, pushed.** Nothing of ours is uncommitted. Kylie hasn't confirmed Vercel shows `eeb0bc6` Ready yet. E10 (Week 9, Grammy Night) airs **Tuesday 2026-11-10, 8pm ET** (`airs_at` 01:00Z Nov 11). Nothing more needs building before it.

Shipped this session (all app-only, no SQL). Each piece was browser-checked at 360/390px with throwaway accounts and writes blocked:
- **Finish Week West-feed guard** (`7272ced`). From the East curtain until 10pm PT, Finish Week first asks "West Coast Is Still Watching" (Wait / Finish Week Now), then runs the usual eliminations check (`westFeedStillAiring`, `src/lib/episode-banner.ts`). It was seen only with the button forced on locally, because E10 has nothing scored yet. Its first real use is E10 night.
- **Couple names open the couple page from more places**: Home Recent Activity, the Results Eliminated banner, league cards on Home and Manage Leagues, League at a Glance, saved/locked Grand Finale brackets, and Recast. All of them use `CoupleNameLink`, with no underline. The back link knows Home, Manage Leagues and Recast.
  - Not browser-seen: the Curtain Call glance list, the Grand Finale lists and the Recast claim sheet (the scratch league had no data for them).
- **Couple page league context**:
  - **In Your Leagues card**: the holder plus judges' points per drafted league, read off that league's Couples Leaderboard row (`buildCoupleLeagueRows`).
  - **Per-week gold pick lines**: the same wording as Results (`coupleWeekPickNotes`).
  - The card matched Standings, and the lines matched Results, caught up, Spoiler-Free at Week 6 and as a co-manager.
- **Fixes**: the Recast subtitle uses the League Settings labels, and long manager names wrap in League at a Glance. `scoringSettingsFromRow` (`src/lib/scoring.ts`) now replaces the copies in Standings and Score History. The publish path (`weekly-score-rows.ts`) was deliberately left alone before E10.

## 2. Changes Made

All committed and pushed (`d29f517` … `eeb0bc6`). This sync touches only `MEMORY_HANDOFF.md`.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

`npm run lint` errors come from `.codex-private/` (not ours); `npx eslint src` is clean.

## 3. Key Decisions

- **Settled by Kylie, 2026-11-06:**
  - **West feed: guard, not mask.** Production timestamps show every S35 week was finished after 10pm PT. Codex and the advisor found that masking only Results and the couple page would leave about ten other surfaces leaking. The full analysis is in BACKLOG "Adversarial review".
  - **Couple names link from league cards too.** The draft room was left out (a live, timed draft is the wrong place to leave, and its couples are buttons), and so was a Grand Finale peer's Next elim line (it sits inside a button).
  - **Undrafted couples on In Your Leagues show their what-if points**, matching the Couples Leaderboard.
- **Couple page design calls (advisor-reviewed):**
  - No per-week "On your roster" lines, since In Your Leagues names the holder once.
  - No roster timeline until Kylie decides the holder-spoiler question after E10.
- **Carried over:**
  - **Naming:** rule A. The SQL `special_dance_label` waits until after E10.
  - **Rounds plan:** rounds stay in the order added, only a site admin edits the plan, and Immune ticks Immunity.
  - **E10 dance-offs:** Winner's Bonus, entered on air. The bonus stays blank until it's announced, which holds Finish Week.
- **SQL ships before the app that reads it.** A push to `main` needs Kylie's yes in that turn (handoff syncs excepted).
- **Production reads through the Management API are blocked here.** Ask Kylie to run read-only `.sql`. Service-role REST in throwaway scripts (run from the project root, deleted after) still works.
- **Unchanged practice:**
  - Render-check with throwaway accounts and every non-GET aborted (`scripts/qa-screenshots/seed.mjs up|down`). The seed league can be altered through the service role for a check, then torn down.
  - Stage by name. Attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - **Never `pkill -f`**; use TaskStop.
  - `rm -rf .next` before `npm run dev` after a build.
  - Don't run prettier.
- **Codex runs:** `codex:codex-rescue` sometimes backgrounds itself. If so, fetch the review with `node ~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs result`.

## 4. Backlog & Next Steps

**Before E10:**
- Kylie confirms Vercel shows `eeb0bc6` Ready.
- Kylie glances at E10 on Schedule: guest judges, the Round 1 + Dance-Off plan with Harry & Jenna immune, and air time and length.

**Watch on E10 night** (BACKLOG "Still to see on a real night (E10…)" and "Episode rounds"):
- The Finish Week guard before 10pm PT.
- The Winner's Bonus, then Winner/Loser per heat, then Finish Week.
- Special-dance marks surviving switching away and back; an invalid mark blocking Finish Week by name.
- A four-judge night's score row at 360px.
- Home's Dance Card strike-through on a roster with an eliminated couple.
- The couple page refreshing, with its "posting live" line.
- A loser's "+0" in the Night Summary, with Home leaving it out.

Afterwards, run the runbook step 8 checks for E10 (Kylie runs them).

**After E10, for Kylie** (see BACKLOG):
- **The SQL `special_dance_label` rewrite.** It also fixes "Team Team Dance 2".
- **The roster timeline and holder spoiler, as one question.** Fixing the spoiler changes some Couples Leaderboard numbers.
- **Results' gold elim-pick line misses a double-elimination week's second pick.** A small fix.

Next command: none pending.
