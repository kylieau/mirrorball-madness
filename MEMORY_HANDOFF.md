# Session Handoff

## 1. Current State
**Picks and Standings are now separate routes** (BACKLOG's old item 7). They're committed and pushed as `c8389fa`, and local `main` matches `origin/main`. The routes are `/leagues/[id]/picks` and `/leagues/[id]/standings`, each a thin page on top of the shared `loadLeaguePageBase` (`src/lib/league-page-data.ts`) inside `LeaguePageShell` (`src/components/league-page-shell.tsx`, which replaces the deleted `LeagueTabs`). `/leagues/[id]` is now only a redirect: `?tab=standings` goes to Standings, anything else goes to Picks, and other params carry over. The code was moved as-is (extracted by line range from the old 1,246-line page), not rewritten.

**Verified:**
- `tsc`, `eslint src`, and `npm test` (530 passing).
- A full `next build`, run in an isolated scratchpad copy so the other session's dev server on :3000 wasn't disturbed. Both routes are separate bundles: Standings 3.9 kB, Picks 13.3 kB.
- The redirects, checked by curl against the live dev server.
- A signed-in fetch of both pages with a throwaway account and two leagues, all cleaned up afterwards. It checked: both titles, bottom-nav cross links, Standings free of picks content, the justCreated card, Home/Results nav links, and the Settings close link.

**Not verified:** the league switcher's links. They sit inside a closed Sheet, so they're absent from server-rendered HTML. Nothing has been clicked in a real browser yet. The user was given a 10-step browser-review prompt for Grok/Cursor (tab taps, Back button, switcher, old-URL redirects, week carousels, Home card buttons, Settings round trip, pick save refresh, console) and will report the results.

## 2. Changes Made
All of it is in `c8389fa` (24 files):
- **New:** `src/app/leagues/[id]/picks/page.tsx`, `src/app/leagues/[id]/standings/page.tsx`, `src/lib/league-page-data.ts`, `src/components/league-page-shell.tsx`.
- **Deleted:** `src/components/league-tabs.tsx`.
- **Rewritten as a redirect:** `src/app/leagues/[id]/page.tsx`.
- **Updated links and helpers:**
  - `bottom-nav.tsx`, `league-header.tsx` (now takes a `tab` prop instead of `useSearchParams`), `league-switcher.tsx`, `draft-room.tsx`, `notifications/page.tsx`.
  - `leagues/actions.ts`: create/join redirects now go to `/picks`.
  - The `from=` fallbacks in the draft, settings and waivers pages.
  - `league-triage.ts` and `this-week-carousel.ts`, plus their tests.
- **Revalidation:** `revalidatePath(\`/leagues/${id}\`)` became `"layout"` in the settings, waivers and predictions actions. Redundant `/settings` and `/waivers` revalidations next to those calls were dropped.
- **Docs:** CLAUDE.md gained an Architecture bullet for the routes. BACKLOG item 7 is now the phone click-through, and stale `?tab=` references in BACKLOG were fixed.

**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj`. **Untracked and unresolved:** `scratch/` (BACKLOG item 9). Its `prefill-week3-draft.mts` is the only thing `npm run lint` fails on; `src` is clean.

## 3. Key Decisions
- **Route shape is `/leagues/[id]/picks|standings`, not top-level `/picks`.** The user agreed. Both pages are league-scoped, and the app has no "current league" concept; Home and Results bottom-nav links still use the first league. A remembered last-viewed league could be layered on later without changing these routes.
- **The current league's `picksDue` is hard-coded to `false` in `switcherLeagues`.** The switcher shows a checkmark, never the pill, for the league being viewed, so Standings doesn't load picks state.
- **Never `npm run build` into the shared `.next` while any `next dev` is running.** It corrupts the dev server's chunks; this has bitten three sessions. This session, another session's server was on :3000. The approach that worked: tar the repo (excluding `node_modules`, `.next`, `ios`, `scratch` and `.git`) into the scratchpad, symlink `node_modules`, and run `npx next build` there.
- **Signed-in page checks without a browser:** create a throwaway user with the admin client, sign in through `@supabase/ssr`'s `createServerClient` with an in-memory cookie jar, then `fetch` the dev server with that `Cookie` header. The script must sit in the project root (ESM resolution) and run with `NODE_OPTIONS=--experimental-websocket`. Content inside closed Sheets and Dialogs isn't in the SSR HTML.
- **`BACKLOG.md` edits: always `Edit`, never `Write`.** A `Write` once wiped the whole file.
- **Season Elimination Order is settled:** winner #1 at the top, first-eliminated #N at the bottom, numbered against the full cast size. Re-confirm with the user before changing it; it took four rounds.

## 4. Backlog & Next Steps
Everything deferred is in `BACKLOG.md` "Up next". The immediate next step is the user's Grok/Cursor browser review of the route split (item 7): fix any FAILs they report. Items 1–3 (Spoiler-Free strip mounts, Enter Results polish, Picks/Results changes) are also still waiting on a real browser. Item 6, splitting admin Scores from Enter Results, is the same kind of route split on `/admin/results` and could reuse this pattern.

Next command: `git fetch && git status -sb`
