# Session Handoff — 2026-11-06 (couple history + dance names shipped, before E10)

## 1. Current State

**`main` is at `1d050cf`, pushed.** Nothing of ours is uncommitted. E10 (Week 9, Grammy Night) airs **Tuesday 2026-11-10, 8pm ET** (`airs_at` 01:00Z Nov 11). Kylie hasn't yet confirmed Vercel shows `1d050cf` Ready.

Shipped this session (all app-only, no SQL), each browser-checked at 360/390px with throwaway accounts and writes blocked:
- **Couple history page** `/couples/[id]` (see CLAUDE.md "Couple history"). Results cards, Couples Leaderboard rows and Your Fantasy Roster cards link to it. All gating happens on the server (`loadCoupleHistory`), and Codex found no spoiler leaks. Stats are:
  - **Average:** per night, on the 30 basis.
  - **Best:** the couple's own dance with the largest share of its marks possible, so 30/30 beats 38/40. Shown raw with its out-of; special dances never count.
  - **In Jeopardy:** how many weeks.
- **Special dance naming, rule A** (`src/lib/special-dance-names.ts`, CLAUDE.md Special Dances "Naming"). The short name is the dance's own name (Slaytopia, Dance-Off 1, Dance-Off Immunity). Where it's used:
  - Fan Results, Home and the Night Summary use the short name.
  - Member cards use the full name ("Team Dance · Slaytopia").
  - The couple page uses **Team Dance** (Slaytopia).
  - Both special-dance pickers wrap the name in the menu and stay on one line when closed.
- **Adversarial review fixes** (`1d050cf`, advisor + Codex):
  - Bonuses are always signed ("+0", "−1.5"), and Home drops a loser's 0.
  - The couple page highlights no tab, and the tab bar stays in the originating league.
  - Back keeps `rosterWeek` and returns to `Standings#couples` (`ScrollToHash`).
  - The couple page live-refreshes and shows a "posting live" line.
  - Long names shrink in the closed picker.
- **Earlier small fixes** (`b573f84`): Home shows an immune bonus as "with Dance-Off Immunity"; Points rows stay on one line.

## 2. Changes Made

All committed and pushed (`b573f84` … `1d050cf`). This sync touches only `MEMORY_HANDOFF.md`.

**Not ours; leave unstaged:** `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`, `ios/App/App.xcodeproj/project.pbxproj`, `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`. `npm run lint` errors come from `.codex-private/` (not ours); `npx eslint src` is clean.

## 3. Key Decisions

- **Settled by Kylie 2026-11-05/06:**
  - **Couple history:**
    - a full page, not a sheet;
    - no tap cue (no chevron);
    - judge marks for signed-in viewers only (no SQL);
    - Best as above;
    - the dance count includes dance-off heats but not immunity;
    - the unwatched row points to Results and has no Mark Watched button (the strip's sheet stays the one control).
  - **Naming:**
    - rule A;
    - fans see heat numbers;
    - songs stay after the name;
    - the app part shipped before E10;
    - the SQL `special_dance_label` ("Team Slaytopia" in errors, mirrored in `episode-publication.ts`) waits until after E10.
  - **Carried over from 2026-11-05:**
    - **Rounds plan:**
      - rounds stay in the order they're added;
      - only a site admin edits the plan;
      - Immune ticks Immunity.
    - **E10 dance-offs:**
      - Winner's Bonus, entered on air;
      - the bonus stays blank until it's announced, which holds Finish Week.
- **SQL ships before the app that reads it.** A push to `main` needs Kylie's yes in that turn (handoff syncs excepted).
- **Production reads through the Management API are blocked here.** Ask Kylie to run read-only `.sql`. Service-role REST in throwaway scripts (from the project root, deleted after) still works.
- **Unchanged practice:**
  - render-check with throwaway accounts and every non-GET aborted (`scripts/qa-screenshots/seed.mjs up|down` for a scratch league);
  - stage by name;
  - attribution `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - **never `pkill -f`** (this session broke it once; use TaskStop);
  - `rm -rf .next` before `npm run dev` after a build;
  - a `next/font` build error is a network flake, so retry;
  - don't run prettier (it isn't the repo's formatter).
- **Codex runs:** `codex:codex-rescue` sometimes backgrounds itself. If so, fetch the review with `node ~/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs result`.

## 4. Backlog & Next Steps

See BACKLOG:
- **"Adversarial review of 2026-11-05/06 work":** the open item there is the West feed, a decision for Kylie. After East publish, a West viewer who chose Stay Updated sees that week's outcomes on Results and on the couple page.
- **"Long special-dance names":** the SQL label rewrite (also fixes "Team Team Dance 2").
- **"Couple history":** the next slices are league context and more tap targets.
- **"Episode rounds":** the E10 watch list.

Watch on E10 night:
- a loser's "+0" in the Night Summary, and Home leaving it out;
- the couple page refreshing and its "Week 9 is posting live" line;
- the Winner's Bonus, then Winner/Loser per heat, then Finish Week.

Afterwards, run the runbook step 8 checks for E10 (Kylie runs them, since reads are blocked here).

Next command: none pending.
