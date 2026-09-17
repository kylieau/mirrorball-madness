# Session Handoff

## 1. Current State

Add-to-Home-Screen how-to is on `cursor/add-to-home-screen-notice-c69a` (PR #6 into `main`). Rebased onto latest `main` (after #9 / #11 / #12 / #13 / #14). Owner: **top-level Settings row**, not under Notifications, not on Home. No schema change, no push infra. Do not merge from the agent.

## 2. Changes Made

- **Settings row** (account sheet + `/settings` fallback): label **Add to Home Screen**, subtitle “Open from your Home Screen instead of a browser tab”.
- **Dedicated page** `/settings/add-to-home-screen` — accordion how-to (iOS Safari vs Android Chrome), default open.
- **Home stays clean.** Notifications is picks-due only (no `#add-to-home-screen`).
- Rebase onto `main` after PR #13 deleted `Chip` — the iOS/Android toggle now uses `Button` (`default` / `outline` pills) so we don’t resurrect Chip.

## 3. Key Decisions & Lessons Learned

- A2HS is its own Settings destination, same pattern as Profile / Account — a row that navigates, not a subtitle on Notifications.
- Accordion stays; the tap is “go to the page,” so the how-to opens already expanded.

## 4. Backlog & Deferred Items

Carried forward (untouched):

- Home season strip (#14) and Past picks vs results (#10) — owner-approved, not started.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.
- Real notification delivery (email / FCM / APNs) — this PR is UX guidance only.

After this rebase: `npm run lint` clean, `npm test` **121**, `npm run build` passed (`/settings/add-to-home-screen` in the route list).

## 5. Next Steps

1. Coordinator: phone (~390px) preview — avatar → **Add to Home Screen**. Home should have no A2HS card. Do not merge from the agent.
2. Otherwise wait.
