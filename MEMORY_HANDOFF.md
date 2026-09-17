# Session Handoff

## 1. Current State

Draft PR #17 (`cursor/home-season-strip-d84d`) was reshaped in place. Owner locked: slim episode carousel on **This Week only**, Past picks Ep. N chip unchanged, Home season strip/carousel **removed**. Do not merge from the agent.

## 2. Changes Made

- This Week: `WeekSwitcher` sheet replaced with slim ← `Ep. N — {theme}` → arrows. Prev/next are `/this-week?week=` links so the page re-renders that week's body.
- Carousel list = spoiler-visible completed weeks + upcoming/locked (theme peek, no scores / who went home). Unwatched completed weeks omitted so a direct `?week=` cannot leak results.
- Default: latest visible completed week; before premiere, first peek week. Redundant “the actual results” subtitle dropped — the carousel is the episode label.
- Home: season strip/carousel deleted (`SeasonStrip` + `season-strip` helpers). `/today` restored to the pre-strip layout (leagues + spoiler callout).
- Past picks: still `WeekSwitcher` Ep. N chip (`?tab=yourpicks&week=`).

## 3. Key Decisions & Lessons Learned

- This Week flipping must change the URL and re-fetch, not a client-only transform like the discarded Home carousel — results live behind `resolveSpoilerCutoff`.
- Upcoming belongs on This Week as a theme peek; it does not belong on Home as a schedule strip.

## 4. Backlog & Deferred Items

- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

## 5. Next Steps

1. Coordinator: phone (~390px) This Week — arrows tappable, long themes truncate, flipping updates results via `?week=`, upcoming is theme-only, Home has no strip, Past picks chip unchanged. Preview: https://mirrorball-madness-git-cursor-home-season-strip-d84d-kylie8.vercel.app
2. Do not merge from the agent.
