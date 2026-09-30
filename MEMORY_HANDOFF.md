# Session Handoff

## 1. Current State
**The live-air prompt and Spoiler-Free alignment shipped on the night of the 2026-09-29 episode.** Four commits are pushed; local `main` == `origin/main` at `774da42`:
- `b2b3b2e`: the main change.
- `ad17be6`: strip copy.
- `f1e762a`: the strip pill reads Stay Updated during East.
- `774da42`: the amber strip on every tab. This one deployed about 8:02pm ET, after East had started.

**Verified:** `tsc`, `eslint src`, and `npm test` (549 passing). A full `next build` ran in an isolated copy for `b2b3b2e`; the later three were small UI or copy changes checked with tsc, lint and tests only. Every fan page loaded clean with a throwaway account, Spoiler-Free on and off.

**Not verified:** none of the new states (prompt, strips, gating) were seen rendered. They only appear inside a live window with posted scores, and the container has no browser. At sync time the user was running the live punch list during the episode; the results aren't in yet (BACKLOG item 10).

**What the build does:**
- **Prompt:** "Scores Are Going Live" for everyone (Spoiler-Free on or off) on Home, Results, Picks and Standings. It shows only inside the East window (`airs_at` + `duration_minutes`) or the West window (8–10pm PT), and only once that week has a released draft or a live couple.
  - East **Stay Updated** unlocks drafts (`unlock_draft_scores_through`). West Stay Updated follows published scores only (`mark_episodes_watched_through`).
  - **Mark Watched** is gray during East and enabled during West.
  - **Dismiss** is remembered per week *and coast* per device.
- **Spoiler-Free off no longer auto-sees a revealing week.** `scoredWeekIds` now requires `lastWatchedWeek >= week` for everyone, and `resolveSpoilerCutoff` loads the progress row even with Spoiler-Free off.
- **"Draft scores available" strip** (Follow Along): after the East broadcast, for a viewer who has chosen nothing, on every tab.
- **Posting strip** also shows with Spoiler-Free off, without the "Spoiler-Free ·" label. During East its pill reads **Stay Updated** instead of Mark Watched.
- **Amber strip** "Draft scores · Unverified" shows on all four tabs via `homeStripChoice`.
- **Curtain chips** read Live Now (ET) and Live Now (PT).

## 2. Changes Made
All of the above commits are this session's:
- **Live-air logic:**
  - `src/lib/episode-banner.ts`: `liveAirPhase`, `eastBroadcastEnded`, `toBannerWeeks`, plus tests.
  - `src/lib/spoiler-free-strip-state.ts`: `buildLiveAirChrome` (the one entry point for strip + prompt + `liveWindow`), `buildLivePromptState`, new strip states, plus tests.
- **Gating:** `src/lib/revealing-week.ts` (+ test) and `src/lib/spoiler-cutoff.ts`.
- **Draft data and label:** `src/lib/draft-scores-data.ts` gains `latestReleasedCouple`; `src/lib/draft-scores.ts` (+ test) has the label change.
- **Components:** `live-scores-prompt.tsx` (rewritten), `spoiler-free-strip.tsx` (the draft-gap strip lives here, to avoid an import cycle), `draft-scores-strip.tsx` (`actionSlot`), `episode-banner.tsx` (chips), `home-dashboard.tsx` (prompt moved out), `league-header.tsx`, `league-page-shell.tsx`.
- **Pages:** `src/app/page.tsx`, `src/app/this-week/page.tsx`, `src/lib/league-page-data.ts`.
- **Docs:** CLAUDE.md was updated throughout, including a new "Live-air prompt" paragraph in Home Recent Activity. BACKLOG items 10–11 were added and the stale `LiveScoresPrompt` bullet was replaced.
- **Earlier this session:** `c8389fa`, the Picks/Standings route split. Its phone click-through is still BACKLOG item 7.

**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj`. **Untracked and unresolved:** `scratch/` (BACKLOG item 9).

## 3. Key Decisions
- **No SQL for the coast split.** Mark Watched could already unlock drafts at any time, so enforcing "East only" for Stay Updated on the server protects nothing. The coast logic lives in the app (`buildLivePromptState`).
- **User's answers on the live-air spec**, so don't re-ask:
  - The prompt goes on all fan tabs and waits for the first posted score.
  - Dismiss is remembered per coast, and East Stay users aren't re-prompted in West.
  - Spoiler-Free-off viewers get the same soft strip as their way back in.
  - Mark Watched turns on once the East *broadcast* ends, not at the official publish.
  - The Spoiler-Free switch leaves the prompt open.
  - The amber copy is **"Draft scores · Unverified"** (the user rejected both "may change" and "Not yet official").
  - The "Draft scores available" strip has no "may be ahead of you" suffix.
  - The strip pill **swaps to Stay Updated** during East (the user chose this over graying it).
  - The amber strip must be **consistent across every tab**.
- **The user decided to ship mid-show.** The last deploy landed after the curtain. They accepted that most viewers reload before watching.
- **Mockups vs. the written spec:** only what the user's written spec asked for was built. Extra mockup elements are listed in BACKLOG item 11, not built. Rule over mockup when they conflict (memory: rules-over-mockups).
- **Never `npm run build` into the shared `.next` while a `next dev` is running.** Another session's server was on :3000 again. Build in a scratchpad copy instead: tar the repo excluding `node_modules`, `.next`, `ios`, `scratch`, `.git` and `tsconfig.tsbuildinfo`, then symlink `node_modules`.
- **Signed-in page checks without a browser:** create a throwaway user with the admin client, sign in through `@supabase/ssr`'s `createServerClient` with an in-memory cookie jar, then `fetch` the dev server with that cookie. The script must sit in the project root and run with `NODE_OPTIONS=--experimental-websocket`. Clean up `spoiler_watch_progress` too, now that Spoiler-Free-off users can get a row.
- **`BACKLOG.md` edits: `Edit` or a targeted script, never `Write`.**

## 4. Backlog & Next Steps
Everything deferred is in `BACKLOG.md` "Up next". **First, ask the user for the results of the live punch list (item 10)** and fix any failures. Then work through their decisions on item 11: the dance name via SQL, the Settings picker mid-East, and the mockup extras. The phone click-through of the route split (item 7) and items 1–3 are still waiting on a real browser.

Next command: `git fetch && git status -sb`
