# Session Handoff

## 1. Current State

Home season strip is on `cursor/home-season-strip-d84d` (draft PR into `main`, after Past picks #15). Owner-approved item from BACKLOG.md. Season-scoped on `/today` only — not per-league. Do not merge from the agent.

## 2. Changes Made

- Top of Home: compact Just aired / Up next card. Latest `completed` episode and the next non-completed (`upcoming` or `locked`) from the active season.
- Fan labels via `formatEpisodeCasualWithTheme` (`Ep. N — {theme}`). Air date is `episodes.airs_at` formatted as the show-night calendar date in `America/New_York` (a Tuesday 8pm ET episode still reads Tuesday, including in time zones where that instant is Wednesday).
- Whole strip is one tap target → `/this-week`. No lock-time hint, no schedule dump.
- Spoiler-Free: strip shows theme + air date only. Does not list results, scores, or who went home. `SpoilerRevealCallout` still owns the pending-reveal interrupt; Home still feeds league cards through `resolveSpoilerCutoff`.

## 3. Key Decisions & Lessons Learned

- Theme and air date are schedule facts, not results — keeping Just aired vague would fight the existing “Episode N results are in” callout, which already names the week.
- Up next includes `locked` so the week that just locked (or is airing) does not disappear between pick-lock and results publish.
- Fixed Eastern air-date formatting is SSR-safe (no viewer-TZ hydration guard). Viewer-local lock time is still later polish.

## 4. Backlog & Deferred Items

- Full season schedule dump / a schedule-detail page / Up next lock-time hint — still out of scope.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

## 5. Next Steps

1. Coordinator: phone (~390px) Home — strip at top, tap → This Week; Spoiler-Free still uses the existing Mark-as-watched callout (no results on the strip). Do not merge from the agent.
2. Otherwise wait.
