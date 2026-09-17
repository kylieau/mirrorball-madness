# Session Handoff

## 1. Current State

Home season strip redesign is on `cursor/home-season-strip-d84d` (draft PR #17 into `main`). Owner asked to replace the Just aired / Up next This Week link with a browse-only episode carousel. Do not merge from the agent.

## 2. Changes Made

- Top of Home: horizontal episode carousel for the active season. Left/right arrows (40px tap targets). One slide per episode — `Ep. N — {theme}` + show-night air date (US Eastern).
- Browse-only: no whole-card (or any) link to `/this-week`. Swipe on the slide also moves when the gesture is more horizontal than vertical.
- Kickers only on the season cursor: **This past week** (latest completed) and **Up next** (next non-completed, including `locked`). Earlier/later slides are unlabeled so this is not a schedule dump.
- **Default slide:** most recent completed episode. Before premiere, index 0 (first upcoming). After finale, the finale. Mid-week stays on "this past week"; the right arrow is the peek at next theme.
- Spoiler-Free: theme + air date only. `SpoilerRevealCallout` still owns pending reveal.

## 3. Key Decisions & Lessons Learned

- Defaulting to Up next mid-week would skip the week people are talking about (and that the spoiler callout may already be naming). Completed-as-cursor + arrow-to-upcoming is the split.
- Transform carousel (not a This Week link, not scroll-snap-to-a-new-page). Deep-link from a slide is still out of scope.

## 4. Backlog & Deferred Items

- Full season schedule dump / a schedule-detail page / lock-time hint / slide deep-link — still out of scope.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

## 5. Next Steps

1. Coordinator: phone (~390px) Home — arrows usable, long themes truncate, default is this past week; carousel does not fight the Mark-as-watched callout. Do not merge from the agent.
2. Otherwise wait.
