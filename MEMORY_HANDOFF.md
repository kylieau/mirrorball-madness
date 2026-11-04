# Session Handoff — 2026-11-04 (prep for E10, Grammy Night)

## 1. Current State

**`main` is at `885b87c`, pushed and deploying.** Nothing of ours is uncommitted. E09 (Week 8) was published 2026-11-03. E10 (Week 9, Grammy Night) airs **Tuesday 2026-11-10, 8pm ET** (`airs_at` 01:00Z Nov 11). It's set to one dance per couple, single elimination, no guest judge yet. A dance-off is likely.

Shipped today, each reviewed by Codex (and the advisor on the bigger ones), all SQL applied by Kylie and verified live through the Management API:
- **Special-dance saves held by the page** (`e3e0ea3`).
- **One judge-score row, whole marks 1–10** (`c75bc96`, `40320b5`): `JudgeScoreRow` on one line, names shrink to fit, no guest marker. `apply-whole-judge-marks.sql`.
- **Special-dance draft release** (`d877f8c`, `f2ce70b`). `apply-special-draft-release.sql`.
- **Results cards** (`774a1a7`, `ff00999`): parts under the total (`40 + 40`, `+3 bonus`), no "out of", a dance-off loser's 0 left out.
- **Home Dance Card** (`488a45d`): eliminated/withdrawn couples struck through, spoiler-safe.
- **Special Moments retired** (`aba19a9`): no card, no custom events.
- **Contributors set up special dances** (`5c2b29b`, `dd49f25`). Unpublished week and unposted dance only; the published check runs under the episode lock. `apply-contributor-special-setup.sql`.
- **Setup fields trimmed** (`5c2b29b`): no Artist or Theme / Source (the source goes in the song title); Extra Details suggests Captain, Host, Live Performer, Mentor; Result suggests Winner, Loser, Immune.
- Also live: `apply-draft-release-own-rows.sql` and `apply-special-dances-polish.sql`. Types regenerated.

## 2. Changes Made

All committed and on `main`. This sync touches only `MEMORY_HANDOFF.md` and `BACKLOG.md`.

**Not ours; leave unstaged:** `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`, `ios/App/App.xcodeproj/project.pbxproj`, `supabase/queries/*.sql`.

## 3. Key Decisions
- **Grammy Night entry:**
  - each dance-off heat is its own Dance-Off special, Points per Couple: winner +3 (or +2 if a guest makes it out of 40), loser **0**, never blank, since a blank blocks Finish Week;
  - the immune couple's automatic bonus is an Immunity special with only that couple;
  - never use Finish Week's Fantasy Bonus for show points;
  - the Finish Week Immunity checkbox is a record only.
- **Settled by Kylie 2026-11-03/04,** recorded in CLAUDE.md:
  - whole marks 1–10;
  - the night's judges, out of 10;
  - top scorer follows the show's leaderboard;
  - bonus points count against the night's marks;
  - no "/80" on Results;
  - no Guest label;
  - no Special Moments card;
  - no Artist or Theme / Source fields.
- **Special dances are entities, never couples.** A released special has no live rows, so its members never join `releasedCoupleIdsByEpisode`.
- **`SUPABASE_ACCESS_TOKEN` works** (Database: Read only). Use `POST /v1/projects/wssbwgtsejamlbvfofvu/database/query/read-only` (put the query in a JSON file) for function bodies, constraints and counts, and `npx supabase gen types` after schema changes. To change a live function, read it with `pg_get_functiondef` and edit only what changes.
- **Browser checks against production:** use a throwaway contributor, cleaned up in `finally`. `page.route` aborts every POST, and the `next-action` count proves nothing saved. Never create special dances or releases on a real episode.
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
- what to watch on E10, none of it browser-checked;
- the cleanups: drop `mark_max` / `panel_judge_ids` / `song_source` / `theme_label`, retire the custom-moment tables when the publish RPCs are next rewritten, delete `TeamEntry`;
- styleless marks never saving.

Next: Kylie confirms the Vercel deploy of `885b87c` is Ready. On E10 night, enter dance-offs as above, then run the runbook step 8 checks for E10 with the service role after publish.

Next command: none pending.
