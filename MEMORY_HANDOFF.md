# Session Handoff — 2026-11-05 (prep for E10, Grammy Night)

## 1. Current State

**`main` is at `f1bfd21`, pushed and deploying.** Nothing of ours is uncommitted. E09 (Week 8) was published 2026-11-03. E10 (Week 9, Grammy Night) airs **Tuesday 2026-11-10, 8pm ET** (`airs_at` 01:00Z Nov 11): one dance per couple, single elimination, no guest judge yet, a dance-off likely. Kylie has started prefilling E10 on Enter Results (Amber & Pasha, Paso Doble, "Bring Me to Life", no marks).

Shipped this session (all pushed; browser-checked with throwaway accounts, POSTs aborted where real data was involved):
- **Judge boxes wait for a dance style** (`a142fa6`): a couple's boxes are disabled with "Pick a dance style to enter scores." until the dance has a style, since a draft save skips a styleless dance.
- **League overtakes in Home activity** (`a11e599`): "Kim overtook Pat and you for 2nd in Alpha" per league per week, after that week's eliminations, from `weeklyRankMoves` (`src/lib/league-rank-moves.ts`) inside `computeLeagueHomeSummary`. Replaces "you took the points lead". Hidden with eliminations in the West window.
- **Announced lineup** (`2c2b924`): saved styles and songs show to signed-in fans before publish, on Results' "Results aren't in yet" card and under each couple in Picks' Curtain Call dropdowns. `visible_draft_lineup()` (`supabase/apply-draft-lineup.sql`) is **applied live and verified** (anon denied, authenticated allowed, definer); types regenerated. `weekLineup` hides it until every earlier week is watched; browser-checked with a Spoiler-Free viewer who is behind.
- `f1bfd21`: BACKLOG notes.

Also checked: every published episode but E02 holds a correction seed identical to its live rows. Harmless; recorded in BACKLOG.

## 2. Changes Made

All committed and pushed. This sync touches only `MEMORY_HANDOFF.md`.

**Not ours; leave unstaged:** `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`, `ios/App/App.xcodeproj/project.pbxproj`, `supabase/queries/*.sql`. `npm run lint` errors all come from `.codex-private/` (not ours); `npx eslint src` is clean.

## 3. Key Decisions
- **Settled by Kylie 2026-11-05:**
  - overtakes are **net per week**, recomputed on load (a swap and swap-back in one night leaves no line); no stored ledger;
  - lineup goes in the Picks dropdown (option A), not a separate "This Week's Dances" row;
  - the Results lineup can vanish once scores start posting for a Stay Updated viewer (peek mode only);
  - special dances need not be in the lineup; they show once posted.
- **"Save as Draft Score" stays disabled until a mark is typed.** It releases scores to fans; releasing a scoreless couple would feed a 0 into draft-night standings. Styles and songs already autosave on their own.
- **Live updates during a reveal are opt-in.** Posted couples reach Home activity, Standings and the rest only for viewers who chose Stay Updated or Mark Watched (Spoiler-Free on or off). Kylie accepted this ("got it okay").
- **Grammy Night entry:** each dance-off heat is its own Points per Couple special (winner +3, or +2 if a guest makes it out of 40; loser **0**, never blank); the immune couple's bonus is a one-couple Immunity special; never use Finish Week's Fantasy Bonus for show points; the Finish Week Immunity checkbox is a record only.
- **Special dances are entities, never couples.**
- **`SUPABASE_ACCESS_TOKEN` works** (read only): `POST /v1/projects/wssbwgtsejamlbvfofvu/database/query/read-only` with the query in a JSON file. `active_season_id()` is not callable there; use the latest/`is_active` season.
- **Browser checks:** `scripts/qa-screenshots/seed.mjs up|down` for a scratch league; temp scripts in the project root, deleted after; abort POSTs on real episodes. After `rm -rf .next`, warm routes with `curl` before Playwright (first compile can pass 30s).
- **Unchanged:**
  - a push to `main` needs Kylie's yes in that turn (handoff syncs excepted);
  - SQL goes to Kylie as `.sql` files, rehearsed in PGlite;
  - never ask for the DB password;
  - throwaway accounts only;
  - stage by name;
  - attribution `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - never `pkill -f`;
  - `rm -rf .next` before `npm run dev` after a build;
  - a `next/font` build error is a network flake, so retry.

## 4. Backlog & Next Steps
See BACKLOG "Special dances follow-ups — 2026-11-04":
- E10 watch list (special-dance card, dance-offs as specials, Home strike, four-judge row, and now overtakes and the lineup card over the 20s refreshes);
- the style list has no Charleston / Hustle / Lindy Hop, so add any Grammy Night needs before Tuesday;
- after E10, not in a show week: drop `mark_max` / `panel_judge_ids` / `song_source` / `theme_label`, retire the custom-moment tables with the next publish-RPC rewrite, delete `TeamEntry`.

Next: Kylie confirms the Vercel deploy of `f1bfd21` is Ready and keeps prefilling E10's dances on Enter Results. On E10 night, enter dance-offs as above, then run the runbook step 8 checks for E10 with the service role after publish.

Next command: none pending.
