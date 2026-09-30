# Session Handoff

## 1. Current State
**Scores and Enter Results are now separate pages, and everything is committed and pushed.** Local `main` == `origin/main` at `11a6488`. The same stretch finished the live-air strip/prompt work from the 2026-09-29 episode night.

**The split (`11a6488`):**
- **Scores** stays at `/admin/results` (By Week / By Couple via `?tab=`).
- **Enter Results** is `/admin/results/enter`, propose tier only. A viewer without propose access is redirected to Scores. `?episode=<id>` opens a week directly (that's how Scores' "Continue in Enter Results" links there). `/admin/results?tab=enter` redirects to the new page.
- Results actions now `revalidatePath("/admin/results", "layout")`, so both pages refresh.

**Verified:** `tsc`, `eslint src`, `npm test` (553 passing), and a full `npm run build` (both routes are separate bundles). Signed-in throwaway-account checks passed before a session restart and covered this same code: a plain viewer is redirected away from `/enter`, a commissioner gets the page, `?episode=` renders, and the old `?tab=enter` redirects.

**Not verified:** nothing from tonight has been seen in a browser (the container has none). Specifically unchecked: autosave and Publish after the split (they relied on the old single-page refresh behavior; BACKLOG item 5), the prompt/strip states, and the rest of the browser-check list in BACKLOG.

**Live-air work in this stretch, all pushed:**
- `4049a3c`: every strip Stay Updated pill opens the same **Scores Are Going Live** sheet as the automatic prompt (`LiveScoresSheet` / `LiveScoresPrompt` / `LiveScoresPill` in `live-scores-prompt.tsx`), for the week's current coast, with no chip in the gap or after the night. Stay Updated inside it unlocks directly. The separate "Unlock draft scores?" confirm sheet (`stay-updated-confirm.tsx`) was deleted. The draft strip's pill is also vertically centered.
- `623e97a`: auto-refresh is time-aware. Each page gets `refreshWindows` (30 minutes before the East curtain to 10pm PT, `liveRefreshWindows`), and `RevealAutoRefresh` checks the clock every 20s, so a page opened before the show switches on by itself.
- `8ec74a3` (the user, not us): West Stay Updated and the West-window "Draft scores available" pill are published-only. East, the gap and Mark Watched still unlock drafts. After West Stay the strip reads Watching live · Week N and the amber strip stays hidden.
- `a9ebbe4`: docs only. CLAUDE.md documents the Results gold lines (`coupleLeagueNotes`), and the backlog was pruned.
- Earlier in the night (already pushed before the last sync): the prompt/strip rebuild, Stay Updated as the only opt-in label, the "Latest: {First} & {First} · N/M" draft-strip line, and bold celebrity names on league cards.

## 2. Changes Made
This stretch's files, all committed:
- **Split:** `src/app/admin/results/page.tsx`, `src/app/admin/results/enter/page.tsx` (new), `src/app/admin/results/actions.ts`, `src/components/results-screen.tsx` (now Scores-only), `results-form.tsx`, `results-nav.tsx`, `src/lib/results-page-data.ts`.
- **Live-air:** `src/components/live-scores-prompt.tsx`, `spoiler-free-strip.tsx`, `reveal-auto-refresh.tsx`, `league-page-shell.tsx`; `src/lib/spoiler-free-strip-state.ts` (+ test), `episode-banner.ts` (+ test), `league-page-data.ts`; `src/app/page.tsx` and `src/app/this-week/page.tsx`.
- **Docs:** CLAUDE.md throughout, BACKLOG.md.

**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj`. `scratch/` was deleted this session, so it is no longer a concern.

## 3. Key Decisions
- **Stay Updated is the only opt-in label** on every surface, and it opens the Scores Are Going Live sheet with no extra confirm step. Mark Watched stays on the prompt and the "results are in" strip, and is gray on the prompt during East. "Follow along…" is only helper text.
- **West Stay is published-only** (user's call in `8ec74a3`). Don't reintroduce draft unlocks into any West path.
- **The draft strip:** "Draft scores available", "Latest: {First} & {First} · N/M" (no dance name, no "may be ahead of you"), amber strip "Draft scores · Unverified" on every tab. M uses real elimination data; the user said that's not a spoiler concern.
- **League cards:** couple names use first names for both partners, with only the celebrity in bold.
- **The Settings "I last watched" picker is not locked mid-East.** I recommended dropping that idea (Stay Updated already unlocks drafts in East, so it adds no new access). It stays in BACKLOG item 7 until the user says to remove it.
- **Mockups and pasted specs:** only what the user's written spec asks for gets built, and a later direct answer beats an earlier pasted spec. Pasted specs from other tools contradicted earlier answers more than once tonight, so ask before building when they conflict.
- **Builds:** never `npm run build` into the shared `.next` while a `next dev` is running. Build in a scratchpad copy (tar excluding `node_modules`, `.next`, `ios`, `.git`, `tsconfig.tsbuildinfo`, then symlink `node_modules`). If no dev server is running, building in place is fine. `pgrep -af "next dev"` matches its own command line, so read its output carefully. A background build dies if the session restarts and leaves `scratchpad/buildcopy` behind; delete it.
- **Git with a dirty other-session `project.pbxproj`:** `git rebase --autostash origin/main`; stage files by name.
- **Signed-in checks without a browser:** create a throwaway user with the admin client, sign in through `@supabase/ssr` `createServerClient` with an in-memory cookie jar, and fetch the dev server. The script goes in the project root, runs with `NODE_OPTIONS=--experimental-websocket`, and cleans up `spoiler_watch_progress` too.
- **`BACKLOG.md` edits:** `Edit` or a targeted script, never `Write`.

## 4. Backlog & Next Steps
Everything deferred is in `BACKLOG.md` "Up next": the Spoiler-Free strip mounts, Enter Results and Picks/Results checks, the "Built but not checked" list (all need a real browser or a real episode), the two route-split click-throughs (items 5 and 6), and the open live-air follow-up (item 7). There is no in-flight code work. The next thing to do is the user's phone or browser pass, then fix whatever they report.

Next command: `git fetch && git status -sb`
