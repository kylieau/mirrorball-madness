# Session Handoff

## 1. Current State

Draft PR #17 (`cursor/home-season-strip-d84d`): Your Picks Curtain Call is **one card**. Slim `EpisodeCarousel` switches pick form vs past recap. This Week carousel unchanged. Home has no season strip. Do not merge from the agent.

## 2. Changes Made

- `CurtainCallCard` wraps **This week's picks** + shared carousel + either `PickEmBox` or `PastPicksRecap`.
- Default `?tab=yourpicks` lands on the live/upcoming week (dropdowns / lock state). A completed `?week=` shows Nailed it / strike→actual / points. Spoiler lock unchanged.
- No second Past picks card. `PickEmBox` is form-only (no nested card).
- This Week and Home unchanged from the prior reshape.

## 3. Key Decisions & Lessons Learned

- One card title stays **This week's picks** (existing task phrase). The carousel is the week identity — do not add a second “Past picks” heading.

After this pass: `npm run lint` clean, `npm test` **173**, `npm run build` passed. Live Your Picks click-path was not exercised here (no Supabase credentials). Phone (~390px) pass is for the coordinator.

## 4. Backlog & Deferred Items

- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

## 5. Next Steps

1. Coordinator: phone Your Picks — one Curtain Call card; arrows switch form vs recap; no chip; no second card. Preview: https://mirrorball-madness-git-cursor-home-season-strip-d84d-kylie8.vercel.app
2. Do not merge from the agent.
