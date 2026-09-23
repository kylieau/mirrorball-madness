# Session Handoff

_Last updated 2026-09-23. Read this first, then `CLAUDE.md` and `PHASE2_TAXONOMY_PLAN.md`._

## 1. Current State

`main` is clean after PR #30 merged: results entry is three access tiers (view / propose / publish), and the admin chrome is Scores (`/admin/results`), Schedule (`/admin/schedule`), and Show Settings (`/admin/show-settings`). This branch does not change those tiers or that page split.

Phase 2 Show Settings taxonomy is specified in `PHASE2_TAXONOMY_PLAN.md`. This PR implements it:

- Round types are a managed `round_types` table (seeded with Team Dance, Trio Dance, Instant Dance, Judges' Choice, Redemption Dance), assigned on the episode from Schedule via `episode_round_types`.
- `was_team_dance` is migrated onto an episode-level Team Dance row, then dropped from `episode_results` and `draft_episode_results`.
- `dance_styles.category` is a closed nullable check (`ballroom` / `latin` / `show`), set per row in Show Settings after the style is added.
- `episodes.expected_dance_count` ("Dances (Per Couple)") is owned by Schedule. Publish no longer writes it.

The owner still needs to run `supabase/apply-round-types-and-style-categories.sql` in the Supabase SQL Editor. `src/lib/supabase/types.ts` in this PR is hand-updated to match that schema — this environment has no `SUPABASE_ACCESS_TOKEN`, and the live project does not have the new tables until the SQL runs. Regenerate types afterward.

`tier-commish` / `tier-plain` QA accounts are already deleted.

## 2. Changes Made

- `supabase/schema.sql` and `supabase/apply-round-types-and-style-categories.sql`.
- `loadJudgesAndDanceStyles` renamed to `loadResultsTaxonomy` (`src/lib/results.ts`); `loadResultsPageData` joins episode → round type names and selects `expected_dance_count` and dance-style `category`.
- `applyEpisodeSchedule` writes round types (delete-then-reinsert, same shape as `episode_participants`) and `expected_dance_count`. `applyEpisodeResults` / `publishEpisodeDraft` no longer touch that column or `was_team_dance`.
- Show Settings: `DanceStylesCard` (per-row category `Select`) and a Round Types `NamedItemsCard`. Schedule's episode sheet ticks round types and sets dances per couple; episode rows and Scores → By Week show round-type badges.
- `scheduleEpisode`, `updateSeasonSettings`, and `publishEpisodeResults` also `revalidatePath("/admin/schedule")`. Judge, dance-style, and round-type actions also `revalidatePath("/admin/show-settings")`.

## 3. Key Decisions

- Round types are episode-level because a round type is round-wide. Per-couple storage was the same boolean repeated, not extra information.
- Category is a check constraint, not its own table — that list is closed. Round types are a table because the list is not.
- `addTeamDance` / `TeamDanceSheetContent` stay. Only the `wasTeamDance: true` flag line was removed. Renaming the sheet is a later cosmetic, out of scope.
- Per-dance `dance_scores.format` and round-type availability windows were not built.

## 4. Backlog & Deferred Items

- **Equal-EV scoring** — still deferred.
- **Dance Card calibration overshoot** (~25%) — still deferred. The rigorous fix would shrink the placement bonus from 106/53/28/14/7 to about 14/7/4/2/1 and gut the feature; that is a product call, not a quiet patch.
- Owner-run migration, types regen, and the live click-through in `PHASE2_TAXONOMY_PLAN.md`'s Verification section (add a round type, tick it on Schedule, confirm badges, set a dance-style category, confirm dances-per-couple survives publish, confirm schedule/show-settings edits refresh without a manual navigate-away).
- Per-dance format column and round-type availability windows.

## 5. Next Steps

1. Owner runs `supabase/apply-round-types-and-style-categories.sql`, then regenerates `src/lib/supabase/types.ts`.
2. Leave the PR draft for Push Pilot phone preview before merge, matching PR #30.
3. Live click-through from the plan's Verification section once the SQL has been applied.
