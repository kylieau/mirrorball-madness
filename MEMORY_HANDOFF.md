# Session Handoff

## 1. Current State
**The "borrow from Fan/Friction" pass is done, committed and pushed.** Local `main` == `origin/main` at `28ce2da`. Type-check, `eslint`, `npm test` (553 passing) and `npm run build` pass. **Nothing has been seen in a browser or on a phone** (the container has none), and no load times were measured, so the speed gain is unproven. The user did say "it looks great" after the skeleton and frame work, so some of it has been seen on their side.

What shipped, in order:
- **`edfef79` Parallel loading:** `loadLeaguePageBase` (`src/lib/league-page-data.ts`), `loadHomeLeagueData` (`src/lib/home-league-data.ts`), the Results page (`src/app/this-week/page.tsx`) and Home (`src/app/(fan)/page.tsx`, module-stack query) now start independent queries together instead of in a chain. Order changed only, not what is fetched.
- **`1e24dfd` Skeletons, frame, identity:** `loading.tsx` on Home, Results, Picks and Standings, all rendering `FanPageSkeleton` (`src/components/fan-page-skeleton.tsx`). Home moved into the `(fan)` route group so its skeleton doesn't cover login or admin. The whole app is one 30rem column (`--frame-width`, `--desk` in `globals.css`, owned by `src/app/layout.tsx`) with a shadow from 520px up; fixed bars and bottom sheets cap to `max-w-(--frame-width)`; per-page `max-w-2xl` was removed. `src/config/app.ts` holds name, slug and tagline; `src/app/manifest.ts` builds the install manifest from it. Tap highlight is off and tab items are `min-h-11`. `usePersistedState` prefixes keys with the app slug (existing collapse and dismissal state reset once).
- **`171b584`:** removed the two project `.claude/commands` (they were already staged as deletions).
- **`09eeccc`:** cherry-picked the logo pack from `cursor/logo-design-pack-55ad` into `docs/design/logo/` (docs only).
- **`28ce2da` Logo:** icons (`apple-touch-icon`, `icon-192/512`, `icon-maskable-192/512`), `src/app/favicon.ico` and the top-bar glyph (`public/mark-glyph.png`, replaces the 🪩 in `top-bar.tsx`) are cropped from the locked gold-mirrorball art onto flat plum `#401b47`.

**Verified earlier by the user's own check, not by us:** the live-air strip/prompt work from the 2026-09-29 episode night (see BACKLOG).

## 2. Changes Made
All of this session's files are committed. **Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (separate in-progress iOS work). The user had two staged `.claude/commands` deletions at the start; those are now committed at their request.

## 3. Key Decisions
- **Vite rewrite declined.** The instant-tap feel in Fan/Friction comes from it being a client-only SPA; Mirrorball is Next.js with server-rendered pages and server actions, and a rewrite (36k lines, 24 pages, admin checks living in server actions) was judged 2-3 weeks and high-risk. Skeletons plus parallel loading were chosen instead. If taps still feel slow, measure first, then consider prefetching or trimming the duplicate `getUser()` calls (middleware, layout `SiteHeader`, page).
- **Light phone frame, not Fan/Friction's no-page-scroll layout.** The page still scrolls; the full version would break Next's scroll restoration and touch every page. Revisit only if asked.
- **Home-screen icon stays the gold mirrorball.** The user considered the 🪩 emoji instead and chose to keep gold. Apple's emoji art is proprietary; the only open-source stand-in (Twemoji, CC-BY 4.0) is pastel blue, which breaks the logo pack's "no cyan / plum + gold only" rail. If revisited, ask for the user's own image.
- **Skipped from Fan/Friction:** a separate theme file (palette already lives in `globals.css`) and the first-run tips overlay (new feature, not a borrowed habit). User chose the storage-prefix-only version of that piece.
- **Wordmark, stacked splash and glyph in the logo pack:** only the glyph is used. The wordmark and splash are unused and not locked.
- **Stay Updated is the only opt-in label** on every surface; it opens the Scores Are Going Live sheet with no extra confirm. West Stay is published-only (the user's call, `8ec74a3`); don't reintroduce draft unlocks into a West path.
- **Settings "I last watched" is not locked mid-East.** Stays in BACKLOG item 7 until the user says to remove it.
- **Mockups and pasted specs:** only what the user's written spec asks for gets built; a later direct answer beats an earlier pasted spec. Ask before building when they conflict. Write out a plan before making changes when the user asks for one (they did this session, after I started editing first).
- **Builds:** never `npm run build` into the shared `.next` while a `next dev` is running; check `pgrep -af "next dev"` and read its output carefully. No dev server was running this session, so building in place was fine.
- **Git with a dirty other-session `project.pbxproj`:** `git rebase --autostash origin/main`; stage files by name, and commit with a pathspec when other files are staged.
- **Signed-in checks without a browser:** throwaway user via the admin client, `@supabase/ssr` `createServerClient` with an in-memory cookie jar, script in the project root with `NODE_OPTIONS=--experimental-websocket`, clean up `spoiler_watch_progress` too.
- **`BACKLOG.md` edits:** `Edit` or a targeted script, never `Write`.

## 4. Backlog & Next Steps
Deferred work is in `BACKLOG.md` "Up next", including the new item 8 for this session's browser and phone checks. No code work is in flight. Next is the user's phone pass on the deployed build (confirm the Vercel deployment is Ready, not Error), then fix whatever they report.

Next command: `git fetch && git status -sb`
