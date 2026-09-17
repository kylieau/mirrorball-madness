# Session Handoff

## 1. Current State

Judge archive is on `cursor/archive-scoring-judges-3e73` (PR into `main`). **Owner must run the `people.archived_at` ALTER on live Supabase before deploying the app** — the Settings/Enter Results queries select that column.

## 2. Changes Made

Archive (not hard-delete) for Scoring judges:

- `people.archived_at timestamptz` — null = standing panel (empty score box on every dance). Timestamp = archived: row and `judge_scores` stay, they drop out of default Enter Results boxes unless that dance already has a score for them.
- Settings (`JudgesDanceStylesManager`) has Archive / Restore per judge. Archived list is always visible when any exist. Re-adding an archived name restores that row.
- Dance-styles management is unchanged (`NamedItemsCard` is now judges-free).

## 3. Key Decisions & Lessons Learned

- Column on `people`, not a judges-only table or `is_archived` boolean. Judges *are* people rows; `archived_at` matches existing timestamp-null patterns (`results_published_at`, `deletion_requested_at`). Celebrities/pros leave it null.
- Writes stay on the admin client via thin server actions (`archiveJudge` / `restoreJudge` / `addJudge` → `src/lib/admin-people.ts`), same as the existing add-judge path. No authenticated UPDATE grant on `people` — that would be the `is_super_admin` class of hole.
- Enter Results filters with `judgesForScoreInputs`: standing panel + any archived judge who already scored *that dance*. View Results still receives the full list so historical names resolve.

## 4. Backlog & Deferred Items

Carried forward (untouched):

- Manual browser verification still owed for Season Clock + Grand Finale deadline caption.
- View Results / This Week "DND" / "—" display still needs a real published Did Not Dance couple.

This PR also needs a phone (~390px) visual pass on Admin → Settings and Enter Results.

## 5. Next Steps

1. Run the live ALTER (see PR). Do not deploy the app first.
2. Review/merge the archive PR. Do not merge from the agent.
3. Otherwise wait — nothing else is mid-flight.
