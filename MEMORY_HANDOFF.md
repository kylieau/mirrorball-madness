# Session Handoff

## 1. Current State

Draft PR for sticky bottom nav on web (`cursor/sticky-bottom-nav-web-6539`). Starts from latest `main` (PR #17 merged). Do not merge from the agent.

## 2. Changes Made

- Fan and admin tab bars stay pinned to the viewport bottom on every width (removed `sm:static`, which flipped Admin under the header and Home/Results after the content).
- Tab bars span the `max-w-2xl` content column (removed `sm:w-fit sm:justify-start` so gold rules line up with the column, not the label cluster).
- Shared wrapper: `BottomNav` / `FanBottomNav` in `src/components/bottom-nav.tsx`. Surfaces: Home (`/today`), Results (`/this-week`), `LeagueTabs`, `AdminResultsTabs`.
- Admin Save/Publish sits above the tab bar (`BOTTOM_NAV_STACK_ABOVE`) so the two sticky bars don’t overlap.
- BACKLOG.md marks sticky/width implemented. Episode dropdown same-line layout and icon/label redesign stay out of scope.

## 3. Key Decisions & Lessons Learned

- One shared wrapper for both the sticky-bottom and width fixes — they want the same chrome.
- League Picks/Standings are Links into `FanBottomNav` (URL is already the source of truth); no `TabsTrigger` needed for those two.

## 4. Backlog & Deferred Items

- Episode dropdown same-line layout — still parked.
- Home season strip — owner-approved, still not started.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

After this pass: `npm run lint` clean, `npm test` **173**, `npm run build` passed. Vercel preview is login-walled from this container (no session). Local layout check of the real `BottomNav` / `FanBottomNav` at 390×844 (Chrome device mode) and wide desktop: bar stays viewport-bottom and matches the `max-w-2xl` column. Live signed-in click-path on Home / Results / Picks / Standings / Admin was not exercised here.

## 5. Next Steps

1. Coordinator: signed-in phone (~390px) and desktop on the preview — Home / Results / Picks / Standings / Admin stay bottom-aligned and match the content column. Preview: https://mirrorball-madness-git-cursor-sticky-bottom-nav-web-6539-kylie8.vercel.app
2. Do not merge from the agent.
