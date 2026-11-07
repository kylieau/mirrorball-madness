# Session Handoff — 2026-11-07 (elim-pick line, SQL label, season track shipped; E10 setup checked)

## 1. Current State

**`main` is at `de90936`, pushed.** Nothing of ours is uncommitted. Kylie hasn't confirmed Vercel shows `de90936` Ready yet. E10 (Week 9, Grammy Night) airs **Tuesday 2026-11-10, 8pm ET** (`airs_at` 01:00Z Nov 11). Nothing more needs building before it. Kylie has a new task waiting.

Shipped this session:
- **Results' double-elimination elim-pick line** (`435e894`, app only). Results now reads `predicted_eliminated_couple_id_2` too, so both picks get a gold "elim pick" line. Browser-checked on Week 7 (the S35 double) with a scratch league, writes blocked.
- **SQL `special_dance_label` on rule A** (`2b40ea4` + docs `8e5f735`). `supabase/apply-special-dance-label.sql` was **applied live 2026-11-07 and verified** through service-role `special_dance_status`: "Team Dance · Wildcats", "Team Dance · Slaytopia", and the Dance-Offs unchanged. `episode-publication.ts` now calls `specialDanceFullName`. Parity is rehearsed in `special-dance-label-db.test.ts`. Older DB tests whose messages come from the TS plan were updated; ones that assert old-stack SQL messages were left alone.
- **Home curtain season track ends at the Finale week** (`de90936`, app only). There is one dot per week through `competition_weeks.is_finale` (S35: 11 dots). With no finale marked, it falls back to the old seven-dot padding. Browser-checked on Home at 360/390px, signed in and as a guest.
- **E10 setup checked on production (read-only):**
  - Standing panel only, no guests (Kylie confirmed there's no guest judge).
  - 120 minutes, not a double.
  - Round 1 Individual Dance, then Round 2 Dance-Off (Winner's Bonus, bonus blank) with three heats: Amber/Ezra, Jenna D/Tatyana, Connor/Maura.
  - Harry & Jenna immune via the Dance-Off Immunity row.
  - All 7 active couples have draft lineup rows.
  - E10 has no round-type chip because "Dance-Off" isn't a managed round type. That's harmless and optional.

## 2. Changes Made

All committed and pushed (`435e894`, `2b40ea4`, `8e5f735`, `de90936`). This sync touches only `MEMORY_HANDOFF.md`.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

`npm run lint` errors come from `.codex-private/` (not ours); `npx eslint src` is clean. `git push` prints a harmless `gh: not found` credential-helper warning, but the push succeeds.

## 3. Key Decisions

- **Settled by Kylie, 2026-11-07:**
  - **The season track counts weeks, not episodes**, ending at the Finale-marked week. I offered per-episode dots; she didn't ask for them.
  - **The SQL label rewrite shipped before E10** at Kylie's request. Only message text changed.
- **Settled by Kylie, 2026-11-06:**
  - **West feed: guard, not mask.** See the BACKLOG "Adversarial review".
  - **Couple names link from league cards too.** The draft room and a Grand Finale peer's Next elim line are left out.
  - **Undrafted couples on In Your Leagues show their what-if points.**
- **Couple page:** no per-week "On your roster" lines, and no roster timeline until Kylie decides the holder-spoiler question after E10.
- **Carried over:** naming rule A, in the app and now in SQL. The rounds plan stays in the order added and only a site admin edits it. E10 dance-offs use Winner's Bonus, entered on air; a blank bonus holds Finish Week.
- **SQL ships before the app that reads it.** A push to `main` needs Kylie's yes in that turn (handoff syncs excepted).
- **Production reads:** service-role REST in throwaway scripts, run from the project root and deleted afterwards. The Management API is blocked.
- **Unchanged practice:**
  - Render-check with throwaway accounts and every non-GET aborted (`scripts/qa-screenshots/seed.mjs up|down`). Results takes `?week=<week id>`, not a week number.
  - Stage by name. Attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - **Never `pkill -f`**; use TaskStop.
  - `rm -rf .next` before `npm run dev` after a build.
  - Don't run prettier.
- **Codex runs:** `codex:codex-rescue` sometimes backgrounds itself. If so, fetch the review with `node ~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs result`.

## 4. Backlog & Next Steps

**Before E10:** Kylie confirms Vercel shows `de90936` Ready.

**Watch on E10 night** (BACKLOG "Still to see on a real night (E10…)" and "Episode rounds"):
- The Finish Week West-feed guard before 10pm PT.
- The Winner's Bonus, then Winner/Loser per heat, then Finish Week.
- Special-dance marks surviving switching away and back; an invalid mark blocking Finish Week by name.
- A four-judge night's score row at 360px. E10 has no guest, so this one may not come up.
- Home's Dance Card strike-through on a roster with an eliminated couple.
- The couple page refreshing, with its "posting live" line.
- A loser's "+0" in the Night Summary, with Home leaving it out.
- The new error wording ("Team Dance · …") if a blocker fires.

Afterwards, Kylie runs the runbook step 8 checks for E10.

**After E10, for Kylie** (see BACKLOG): the roster timeline and holder spoiler, as one question. Fixing the spoiler changes some Couples Leaderboard numbers.

Next command: none pending. Kylie has a new task to describe.
