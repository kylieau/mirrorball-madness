# Session Handoff

## 1. Current State

Draft PR #17 (`cursor/home-season-strip-d84d`): fan tabs read **Home / Results / Picks / Standings**. Curtain Call card titled **Curtain Call**. Slim carousel still switches pick form vs recap. Routes unchanged (`/this-week`, `?tab=yourpicks`). Do not merge from the agent.

## 2. Changes Made

- Bottom nav + page titles: This Week → **Results**, Your picks → **Picks**. Home and Standings unchanged.
- `CurtainCallCard` title is **Curtain Call** (not “This week's picks”, not “Picks”). Episode identity stays on the carousel.
- Docs updated for the new tab names.

## 3. Key Decisions & Lessons Learned

- Label-only rename — do not retarget `/this-week` or `?tab=yourpicks`.

## 4. Backlog & Deferred Items

- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

## 5. Next Steps

1. Coordinator: phone nav reads Home / Results / Picks / Standings; Results page title; Picks page title; Curtain Call card title. Preview: https://mirrorball-madness-git-cursor-home-season-strip-d84d-kylie8.vercel.app
2. Do not merge from the agent.
