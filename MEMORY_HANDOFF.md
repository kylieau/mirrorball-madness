# Session Handoff

## 1. Current State

Competition week (not TV episode) as the fan-facing unit, plus S35 premiere data-fold SQL, on branch `cursor/competition-week-and-s35-premiere-fold-beb3`. Draft PR only — do not merge from the agent.

Owner must paste-run `supabase/apply-s35-premiere-fold.sql` in the Supabase SQL Editor **before** deploying the app code that filters `episodes.is_scoring`. Manager scores are **not** wiped by that script (owner handles separately).

## 2. Changes Made

- Fan labels: `formatEpisodeCasual` / `Short` / `WithTheme` now say `Week N` / `Week N — {theme}`. Admin `formatEpisodeLabel` stays `S35 E02`.
- `episodes.is_scoring` (default true) = competition week. Exhibition/interview nights are omitted from Results and Picks carousels. Admin Schedule has a Competition week checkbox.
- S35 one-shot SQL folds premiere night 1+2 into week 1, deletes unused interview night (or parks at week_number 0), remaps week ints, RAISE NOTICE before/after.
- Docs: CLAUDE.md, BACKLOG.md, this file.

## 3. Key Decisions & Lessons Learned

- Did not reintroduce `week_part`. Split broadcasts fold into one `week_number`.
- No product flag for “scoring starts at week 2”.
- Interview night: delete if unused (no dances/results); otherwise `is_scoring=false` and `week_number=0` so it does not consume 1..N.
- Folded premiere `airs_at` = earlier night; theme = combined or `Premiere`; `episode_participants` cleared (full cast).
- Finale (document only): two true fantasy rounds in one calendar week → two week_numbers; two elims in one round → one week + existing double-elim flags.

## 4. Backlog & Deferred Items

- Phone preview of every fan surface that now says Week (see PR checklist).
- Owner paste-run of `apply-s35-premiere-fold.sql` and separate manager-score wipe.
- DND / "—" live check — still owed.
- Full season schedule dump / lock-time hint / Home timeline — still out of scope.

## 5. Next Steps

1. Run the SQL on the live project; confirm NOTICE before/after episode list.
2. Preview fan Results / Picks / Home spoiler / Standings / Recast / Settings Spoiler-Free copy on a phone.
3. Merge when ready — do not merge from the agent.
