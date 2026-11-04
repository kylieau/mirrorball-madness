# Session Handoff — 2026-11-04 (after E09, before E10)

## 1. Current State

**`main` is at `488a45d`, pushed and deploying.** Nothing of ours is uncommitted. E09 (Week 8) was published 2026-11-03 06:55Z. E10 (Week 9, Grammy Night) airs Monday 2026-11-10 ET and has no data yet.

Shipped to `main` today, each reviewed by Codex and the advisor:
- **Special-dance saves held by the page** (`e3e0ea3`): typed marks/points live in `results-form.tsx` (`specialEdits`, its own `DraftSaveQueue`), so switching entries never drops an edit. Draft merges keep posted special rows.
- **One judge-score row, whole marks 1–10** (`c75bc96`, `40320b5`): `JudgeScoreRow` is shared by couples and specials, on one line with names shrinking to fit, no guest marker. `src/lib/judge-marks.ts` holds the rule. A couple with an invalid mark is held out of the draft save by name while the others save. Specials have no "Out of" or per-dance panel.
- **Special-dance draft release** (`d877f8c`, `f2ce70b`): Save as Draft Score / Drafted · Withdraw on a special's card (propose tier). Fans who unlocked the week see it. `draftDanceScores` / `unpostedDraftDances` carry it through every reader.
- **Results cards** (`774a1a7`): dance lines carry no scores. A multi-dance card shows `40 + 40` (bonus as `+3 bonus`) under the total, with no "out of".
- **Home Dance Card** (`488a45d`): eliminated/withdrawn roster couples are struck through, spoiler-safe.

Live database, all verified 2026-11-04 with the Management API (read-only token):
- `apply-draft-release-own-rows.sql`
- `apply-special-dances-polish.sql` (grokbot's earlier "applied" was wrong; Kylie ran it today)
- `apply-whole-judge-marks.sql`
- `apply-special-draft-release.sql`

Types regenerated from live and committed.

## 2. Changes Made

All committed and on `main`. This sync touches only `MEMORY_HANDOFF.md` and `BACKLOG.md`.

**Not ours; leave unstaged:** `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`, `.agents/`, `AGENTS.md`, `ios/App/App.xcodeproj/project.pbxproj`, `supabase/queries/*.sql`.

## 3. Key Decisions
- **Settled by Kylie 2026-11-03/04, recorded in CLAUDE.md:**
  - whole marks 1–10 only, for couples and specials;
  - special dances always use the night's judges, out of 10;
  - Curtain Call's top scorer follows the show's leaderboard, bonus points included;
  - show bonus points count against the night's marks, not at a fixed rate (+3 → 33 on 30/30, 31.5 on 60/60);
  - Results show no "/80";
  - the score row has no Guest label;
  - special dances release as drafts like couples.
- **Special dances are entities, never couples.** A couple's draft never holds special rows; a released special has no live rows, so its members never join `releasedCoupleIdsByEpisode`.
- **`SUPABASE_ACCESS_TOKEN` works again** (Database: Read only). Use `POST /v1/projects/wssbwgtsejamlbvfofvu/database/query/read-only` to read function bodies and constraints, and `npx supabase gen types` after schema changes.
- **Browser checks against production:**
  - throwaway contributor account, cleaned up in `finally`;
  - `page.route` aborts every POST, and the count of `next-action` requests is the evidence nothing saved;
  - never create special dances or releases on a real episode.
- **Unchanged:**
  - Deploys: a push to `main` needs Kylie's explicit yes in that turn (handoff syncs excepted).
  - SQL: handed over as `.sql` files Kylie runs, rehearsed in PGlite. Never ask for the DB password.
  - Production deletions: guarded `.sql` with exact-count `raise exception`.
  - Data: throwaway accounts only, and never fake releases or `dance_scores`.
  - Git: stage by name, attribution `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Processes: never `pkill -f`.
  - Builds: `rm -rf .next` before `npm run dev` after a `next build` (stale chunk 500s). A `next/font` build error is a network flake; retry.

## 4. Backlog & Next Steps
See BACKLOG "Special dances follow-ups — 2026-11-04":
- what to watch on E10 (none of the special-dance card or Home strike was browser-checked);
- retiring Special Moments' custom events;
- the unused setup fields (Kylie's call);
- dropping `mark_max` / `panel_judge_ids`;
- deleting `TeamEntry`.

Next: Kylie confirms the Vercel deploy of `488a45d` is Ready and spot-checks Results (Week 8) and Home. Then, between show nights, pick up retiring Special Moments' custom events.

Next command: none pending.
