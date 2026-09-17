# Session Handoff

## 1. Current State

Draft PR #17 (`cursor/home-season-strip-d84d`) now shares the slim episode carousel on **This Week and Past picks**. Home season strip/carousel stays removed. Do not merge from the agent.

## 2. Changes Made

- Shared `EpisodeCarousel` (`src/components/episode-carousel.tsx`): slim ← `Ep. N — {theme}` → with href props.
- This Week: same behavior as the last reshape — `/this-week?week=`, spoiler-visible completed + upcoming/locked peek.
- Past picks: Ep. N `WeekSwitcher` chip deleted. Same carousel; flipping uses `?tab=yourpicks&week=`. Locked unwatched weeks still show “Mark as watched” and do not leak results.
- Home: still no season strip.

## 3. Key Decisions & Lessons Learned

- One visual control, two href helpers (`thisWeekHref` / `pastPicksHref`). Past picks still includes unwatched completed weeks so the lock card can prompt; This Week omits them so results cannot leak via `?week=`.

## 4. Backlog & Deferred Items

- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

## 5. Next Steps

1. Coordinator: phone Your Picks → Past picks — chip gone, slim arrows, `?week=` updates comparison, locked weeks stay locked. This Week unchanged. Home has no strip. Preview: https://mirrorball-madness-git-cursor-home-season-strip-d84d-kylie8.vercel.app
2. Do not merge from the agent.
