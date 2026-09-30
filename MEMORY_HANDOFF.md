# Session Handoff

## 1. Current State
**We spent the rest of the 2026-09-29 episode night tuning the live-air strips and prompt from the user's live testing.** Everything is committed and pushed; local `main` == `origin/main` at `43c99da`.

**Verified for every commit:** `tsc`, `eslint src`, and `npm test` (549 passing). There were no new full builds after `b2b3b2e`, since these were small UI/copy/logic changes and a `next dev` from another session was holding `.next`. The fan-read fix for `draft_couple_releases` was verified live: service role and a signed-in throwaway fan both saw 6 rows.

**Not verified:** none of the prompt or strip states have been seen rendered from this container. The user has been checking on their phone; their punch-list results aren't in yet (BACKLOG item 10).

**Commits since the last sync:**
- `4636d53`: Enter Results puts Season Elimination Order at the bottom of the page.
- `e919aab` (the user/Cursor, not us): an RLS policy so fans can read `draft_couple_releases`. Before it, fans never saw a release, so the prompt and strips were dead for them.
- `f37c207`: the (i) copy is now two locked paragraphs.
- `e08ed93`: **Stay Updated is the only opt-in label.**
  - The posting strip pill is Stay Updated. It unlocks drafts during East, and follows published scores only otherwise, West included.
  - "Draft scores available" shows whenever released drafts are ahead of a viewer who hasn't opted in, East included. Its Stay Updated unlocks drafts in the gap and during East; during the West window it is published-only.
  - A viewer who chose West Stay while drafts are out sees Watching live · Week N and does not get the amber strip.
  - `eastBroadcastEnded` was removed.
- `88480b7`: the draft strip's second line reads "Latest: {First} & {First} · N/M" (`draftReleaseLabel`: released couples over couples dancing that week).
- `592e94e`: every Stay Updated confirms first in one bottom sheet (`stay-updated-confirm.tsx`). On the prompt the sheet swaps in place, and Not now returns to the choices.
- `1442d0f`: the confirm reads "Unlock live scores?" / "…official scores as they post…" when Stay Updated is published-only.
- `0ecf17c`: Home/Manage Leagues cards show Curtain Call Home/High as couple first names.
- `43c99da`: league cards bold only the celebrity in every couple name (`StackRow` carries `CoupleNameParts`).

## 2. Changes Made
This stretch's files:
- **Components:** `results-form.tsx`, `live-scores-prompt.tsx`, `spoiler-free-strip.tsx`, `stay-updated-confirm.tsx` (new), `league-triage-card.tsx`.
- **Lib:** `spoiler-free-strip-state.ts` (+ test), `episode-banner.ts` (+ test), `draft-scores.ts` (+ test), `draft-scores-data.ts`, `league-triage.ts` (+ test), `league-module-stack-data.ts`.
- **Docs:** CLAUDE.md throughout, BACKLOG items 10–11.

`e919aab` touched `schema.sql` and SQL files and isn't ours. **Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj`. **Untracked and unresolved:** `scratch/` (BACKLOG item 9).

## 3. Key Decisions
- **Stay Updated is the only opt-in CTA label** (prompt, posting pill, draft pill). "Follow along…" is only helper text under the prompt's Stay Updated, and never a button. Mark Watched stays on the prompt and the "results are in" strip. Mark Watched on the prompt stays gray during East.
- **Every Stay Updated confirms in one light bottom sheet**, the user's locked copy. It never stacks on the prompt, which swaps in place instead.
- **The draft strip:** "Draft scores available" with no "may be ahead of you", and "Latest: {First} & {First} · N/M". **No dance name**: the user dropped it, so no SQL is needed. **M uses real elimination data even for behind Spoiler-Free viewers**: the user said the numbers aren't a spoiler concern.
- **The amber strip reads "Draft scores · Unverified"** on every tab.
- **League cards: only the celebrity is bold**, not the "&" or the pro.
- **Pasted specs from other tools can contradict earlier answers in the same session.** This happened twice tonight: "may be ahead of you" came back, and Mark Watched vs Stay Updated on the posting pill flipped. Ask before building; the user's latest direct answer wins.
- **Never `npm run build` into the shared `.next` while any `next dev` is running.** Build in a scratchpad copy: tar excluding `node_modules`, `.next`, `ios`, `scratch`, `.git` and `tsconfig.tsbuildinfo`, then symlink `node_modules`.
- **When rebasing onto upstream with the other session's dirty `project.pbxproj`, use `git rebase --autostash origin/main`.** A plain pull --rebase refuses.
- **Signed-in checks without a browser:** create a throwaway user with the admin client, use `@supabase/ssr` `createServerClient` with an in-memory cookie jar, and fetch the dev server. The script goes in the project root and runs with `NODE_OPTIONS=--experimental-websocket`. Clean up `spoiler_watch_progress` too.
- **`BACKLOG.md` edits: `Edit` or targeted scripts, never `Write`.**

## 4. Backlog & Next Steps
Everything deferred is in `BACKLOG.md` "Up next". **First, get the user's live punch-list results (item 10)** and fix any failures. Then get their calls on item 11: locking the Settings picker mid-East, the unbuilt mockup extras, and the design packs. Item 7 (the route split click-through) and items 1–3 are still waiting on a real browser.

Next command: `git fetch && git status -sb`
