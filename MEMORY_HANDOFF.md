# Session Handoff

## 1. Current State
**Native-feel touch pass: done, committed on `polish/native-touch-css` (`217e4ee`), not pushed, not felt on a phone.** `touch-action: manipulation` on all tappables and `overscroll-behavior-y: none` (globals.css); `active:` feedback beside every list-row/nav `hover:`; invisible `before:-inset-2` hit areas on the Spoiler-Free strip pill and the draft-scores "i" (~40px targets); Score History chips `py-1`. `eslint`, `npm run build` and `npm test` (553) pass. Verified via the headless screenshot pass (seed up → shoot at 360/390 → seed down): chips render clean, no layout shift from the insets. What Chromium *can't* show — pressed feedback, zoom-wait removal, overscroll, thumb reach — is appended to BACKLOG item 8 (the phone pass).

The branch sits one commit ahead of `main` == `origin/main` at `4d6ba36` (the screenshot-pass commit; `cb1ebbc` before it is the sticky top bar, committed and pushed last session). No upstream is set; the user hasn't said push or PR yet.

## 2. Changes Made
This session, all in `217e4ee` (staged by name):
- `src/app/globals.css` — overscroll + touch-action block
- `src/app/notifications/page.tsx`, `src/app/settings/page.tsx`, `src/components/account-settings-sheet.tsx`, `src/components/league-settings-links.tsx` — `active:bg-muted` on list rows
- `src/components/bottom-nav.tsx` — `active:text-foreground` on inactive tabs
- `src/components/spoiler-free-strip.tsx`, `src/components/draft-scores-strip.tsx` — pseudo-element hit areas
- `src/components/score-history-panel.tsx` — chip `py-0.5` → `py-1`
- `BACKLOG.md`, `MEMORY_HANDOFF.md` — this sync (uncommitted at write time)

**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (separate in-progress iOS work).

## 3. Key Decisions
- **`/resume-handoff` and `/sync-handoff` are deleted** (`171b584`); resume by reading this file + `BACKLOG.md` by hand and verifying both against `git log` first — this file goes stale (last session's claimed-uncommitted work was already `cb1ebbc`).
- **The pinned bar is the real top bar on every fan tab, with no page-specific slim variant.** The league switcher (Picks/Standings) and episode carousel (Results) scroll away with the title — cost the user accepted. Restore only if asked.
- **Vite rewrite declined.** Skeletons plus parallel loading instead. If taps still feel slow, measure first, then consider prefetching or trimming the duplicate `getUser()` calls (middleware, `SiteHeader`, page).
- **Light phone frame, not Fan/Friction's no-page-scroll layout.** Page still scrolls; `overscroll-behavior-y: none` only kills rubber-band/pull-to-refresh at the edges. Revisit only if asked.
- **Home-screen icon stays the gold mirrorball** (not the 🪩 emoji; Twemoji's cyan breaks the plum + gold rail). If revisited, ask for the user's own image.
- **Skipped from Fan/Friction:** separate theme file, first-run tips overlay. Only the logo glyph is used from the logo pack; wordmark and splash are unused and unlocked.
- **Stay Updated is the only opt-in label**; West Stay is published-only (user's call); don't reintroduce draft unlocks into a West path.
- **Settings "I last watched" is not locked mid-East** (BACKLOG item 7 until the user says remove).
- **Mockups and pasted specs:** build only what the user's written spec asks; a later direct answer beats an earlier pasted spec; ask on conflict. Write out a plan first when the user asks for one.
- **Builds:** never `npm run build` into the shared `.next` while `next dev` runs (`pgrep -af "next dev"`).
- **Git with a dirty other-session `project.pbxproj`:** `git rebase --autostash origin/main`; stage by name; commit with a pathspec when other files are staged.
- **Signed-in checks without a browser:** throwaway user via admin client, `@supabase/ssr` `createServerClient` with an in-memory cookie jar, script in project root with `NODE_OPTIONS=--experimental-websocket`, clean up `spoiler_watch_progress` too.
- **Headless screenshot pass** (`scripts/qa-screenshots/`): seed up → `npm run dev` (background, log to scratchpad) → shoot → seed down → kill dev server before building. Good for layout, blind to touch feel.
- **`BACKLOG.md` edits:** `Edit` or a targeted script, never `Write`.

## 4. Backlog & Next Steps
Deferred work is in `BACKLOG.md` "Up next"; the touch-pass phone checks are folded into item 8. Next: ask/confirm whether to push `polish/native-touch-css` or open a PR against `main`, then do the item-8 phone pass and fix whatever the user reports.

Next command: `git push -u origin polish/native-touch-css` (once the user confirms).
