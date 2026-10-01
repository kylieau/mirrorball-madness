# Session Handoff

## 1. Current State
**Sticky top bar unified on all four fan tabs: done, uncommitted, not seen in a browser.** Home, Results, Picks and Standings now always pin the real top bar (Mirrorball Madness wordmark + avatar) via a new `StickyTopBar` (`src/components/top-bar.tsx`). Before, viewers with no status strip had the bar scroll away and a slim page-title/switcher bar slide in. The strip chromes (`HomeSpoilerChrome`, `HomeDraftChrome`) already pinned the same bar and are unchanged. `tsc`, `eslint`, `npm test` (553) pass. `npm run build` was **not** run: a `next dev` is running (pid 10263) and a build would clobber its `.next`. The user said "excellent" to the result, but that is not a browser/phone check of scroll behaviour.

Local `main` == `origin/main` at `f706fbb` (the prior handoff sync) plus the uncommitted work below. The earlier "borrow from Fan/Friction" pass (parallel loading, skeletons, 30rem frame, app identity, logo icons) is all committed and pushed; its phone checks are BACKLOG item 8.

## 2. Changes Made
This session, uncommitted (stage by name):
- `src/components/top-bar.tsx` — `SlimTopBar` replaced by `StickyTopBar`
- `src/app/(fan)/page.tsx`, `src/app/this-week/page.tsx`, `src/components/league-header.tsx` — non-strip branch now `StickyTopBar` + `pt-4` content (matches the strip branches)
- `src/components/scroll-reveal-bar.tsx` — deleted (staged deletion)
- `CLAUDE.md`, `BACKLOG.md` — stale "slim bar" wording corrected
- `MEMORY_HANDOFF.md` — this file

**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (separate in-progress iOS work).

## 3. Key Decisions
- **The pinned bar is the real top bar on every fan tab, with no page-specific slim variant.** Cost the user accepted by asking: the league switcher (Picks/Standings) and episode carousel (Results) no longer follow you down the page; they scroll away with the title. Restore only if asked.
- **Vite rewrite declined.** Skeletons plus parallel loading instead. If taps still feel slow, measure first, then consider prefetching or trimming the duplicate `getUser()` calls (middleware, `SiteHeader`, page).
- **Light phone frame, not Fan/Friction's no-page-scroll layout.** Page still scrolls; revisit only if asked.
- **Home-screen icon stays the gold mirrorball** (not the 🪩 emoji; Twemoji's cyan breaks the plum + gold rail). If revisited, ask for the user's own image.
- **Skipped from Fan/Friction:** separate theme file, first-run tips overlay. Only the logo glyph is used from the logo pack; wordmark and splash are unused and unlocked.
- **Stay Updated is the only opt-in label**; West Stay is published-only (user's call); don't reintroduce draft unlocks into a West path.
- **Settings "I last watched" is not locked mid-East** (BACKLOG item 7 until the user says remove).
- **Mockups and pasted specs:** build only what the user's written spec asks; a later direct answer beats an earlier pasted spec; ask on conflict. Write out a plan first when the user asks for one.
- **Builds:** never `npm run build` into the shared `.next` while `next dev` runs (`pgrep -af "next dev"`).
- **Git with a dirty other-session `project.pbxproj`:** `git rebase --autostash origin/main`; stage by name; commit with a pathspec when other files are staged.
- **Signed-in checks without a browser:** throwaway user via admin client, `@supabase/ssr` `createServerClient` with an in-memory cookie jar, script in project root with `NODE_OPTIONS=--experimental-websocket`, clean up `spoiler_watch_progress` too.
- **`BACKLOG.md` edits:** `Edit` or a targeted script, never `Write`.

## 4. Backlog & Next Steps
Deferred work is in `BACKLOG.md` "Up next". Add to the phone pass (item 8): scroll each of the four tabs with no strip showing and confirm the wordmark + avatar bar stays pinned, with no gap or double bar under the iOS safe area. Then commit the `StickyTopBar` change (it passes tsc/lint/tests; run `npm run build` once the dev server is stopped) and fix whatever the user reports.

Next command: `git add src/components/top-bar.tsx "src/app/(fan)/page.tsx" src/app/this-week/page.tsx src/components/league-header.tsx src/components/scroll-reveal-bar.tsx CLAUDE.md BACKLOG.md && git commit -m "Pin the real top bar on all four fan tabs"`
