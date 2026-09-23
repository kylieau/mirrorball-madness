# MEMORY_HANDOFF

_Last updated 2026-09-23 (end of session). Read this first, then `CLAUDE.md`.
This doc fully supersedes its previous version — that one's open items (the
In Jeopardy SQL "blocker") turned out to already be resolved before this
session started; see §3 for the corrected record._

## 1. Current State

**No feature is actively in progress. Everything from this session is
committed and pushed to `main`** (HEAD `11b8b4f`). The one thing flagged as
"do later" and not started: editing the wording on the Home page's curtain
banner — see §5.

## 2. Changes Made

Source of truth: `git diff --stat 0f6e993..HEAD` (0f6e993 = HEAD at session
start), 11 files, +514/−304:

```
 CLAUDE.md                              |   4 +-
 MEMORY_HANDOFF.md                      |  95 ++++++--
 src/app/admin/results/page.tsx         |  21 ++
 src/app/leagues/[id]/page.tsx          |  17 +-
 src/components/all-results-view.tsx    | 173 ++++++--------
 src/components/results-form.tsx        | 416 +++++++++++++++++++++------------
 src/components/results-screen.tsx      |   8 +-
 src/components/roster-card.tsx         |  18 +-
 src/components/weekly-results-view.tsx |  15 +-
 src/lib/results-outcome.test.ts        |  27 ++-
 src/lib/results-outcome.ts             |  24 +-
```

Four commits, all pushed, all with passing typecheck/lint/vitest (323
tests) and (for the first two) a full `npm run build`:

1. **`5523c1b`** — Move Enter Results/Scores to a view-vs-propose split,
   make In Jeopardy additive. Removed "Correct Results" from Scores
   (`all-results-view.tsx`); Enter Results now auto-seeds a correction
   draft itself when you select an already-published episode with no
   draft yet (`results-form.tsx`, calls `startEpisodeCorrection` from a
   `useEffect`). Scores always shows Published regardless of an
   in-progress correction — the "Correcting" badge is Enter Results' own
   internal indicator now, not shown on Scores. In Jeopardy changed from
   *replacing* the Safe badge to showing *alongside* it everywhere (This
   Week, Scores By Couple text, and newly wired into `roster-card.tsx`'s
   Your Fantasy Roster, which also got a name-before-badge layout swap).
   New shared helpers: `showInJeopardyBadge` / `IN_JEOPARDY_BADGE` in
   `src/lib/results-outcome.ts`. Also: Enter Results tab now titles itself
   "Enter Results" not "Scores"; dropped the redundant West Coast
   broadcast warning (spoiler mode covers it now).
2. **`7be1f5f`** — Apply spoiler-free mode to Scores (By Week / By
   Couple). Real gap found live by the user (not a bug in `/this-week`,
   which was already correct — the leak was specifically on Settings →
   Episodes → Scores → By Week, which had never been wired into
   `resolveSpoilerCutoff` at all). Now gated the same way for every
   viewer regardless of role (no super-admin exemption). A locked week
   shows a card (By Week) or masked row (By Couple) with a real
   `MarkWeekWatchedButton`, mirroring This Week's own pending-reveal
   treatment.
3. **`83a8f17`** — Add a "By Couple" mode to Enter Results: a dropdown to
   jump straight to one couple's row instead of scrolling the full list
   (user explicitly wanted a dropdown, not Prev/Next stepping — that was
   my first pass and got corrected).
4. **`11b8b4f`** — Add a "Leaderboard" mode to Enter Results: couples
   ranked by current judges' score total, `#1..N` with running points
   next to the name, still fully editable.

All three Enter Results view modes (All Couples / By Couple / Leaderboard)
share one extracted `CoupleEntryCard` component in `results-form.tsx` so
they can't drift out of sync with each other.

**Not committed, left alone on purpose:** `ios/App/App.xcodeproj/project.pbxproj`
(pre-existing, unrelated, predates this session) and `scratch/` (untracked
one-off verification scripts, never committed — established convention in
this repo).

## 3. Key Decisions & Lessons Learned

- **The previous handoff's "In Jeopardy SQL blocker" was stale.** Verified
  live at session start: `apply-curtain-call-in-jeopardy.sql` was already
  run, and `src/lib/supabase/types.ts` already matched the live schema
  exactly (zero diff on a fresh regen) — both had silently already happened
  before this session, just never recorded. Don't re-flag this.
- **`.env.local` in this container DOES have `SUPABASE_SERVICE_ROLE_KEY`
  and `SUPABASE_ACCESS_TOKEN`**, contradicting CLAUDE.md's "no live
  database credentials" framing — that line is really about there being no
  direct Postgres connection string (`psql` is installed but has nothing
  to connect to), not about REST access. Live read/write queries and
  `npx supabase gen types` both work directly from here. Left CLAUDE.md's
  wording as-is (defensible as written) but worth knowing.
- **Scores' View tier being "open to any signed-in user" is about access,
  not about overriding a viewer's own spoiler preference.** These are
  orthogonal and the codebase had only ever reconciled the fan-facing
  surfaces (This Week, Picks recap, Home banner) with spoiler-free mode.
  Apply the same reasoning to any *new* admin-adjacent view surface added
  later — don't assume "admin-visible" implies "spoiler-exempt."
- **In Jeopardy is additive, never a replacement for Safe** — this was an
  explicit correction from the user mid-session (an earlier design intent,
  documented as "supersedes," was reversed). If it reappears anywhere new,
  show both badges.
- **Real incident, self-inflicted:** ran `npm run build` (production build)
  repeatedly this session while the long-running `next dev` server was
  live on the same `.next` output directory — corrupted the dev cache
  (`ENOENT .../vendor-chunks/@base-ui.js`, missing webpack chunks) and
  caused a real Internal Server Error for the user. Fixed by killing the
  server, `rm -rf .next`, restarting `npm run dev` in the background with
  output redirected to this session's scratchpad
  (`/tmp/claude-1000/-workspaces-dwts-fantasy/<session>/scratchpad/devserver.log`).
  **Lesson: don't run `npm run build` while a dev server is live** — use
  `npx tsc --noEmit` + `npx eslint` + `npx vitest run` for verification
  instead; only run a full build when no dev server is running, or accept
  needing to restart the dev server afterward.
- **This container cannot run a headless browser** — Playwright has no
  Chromium build for `debian11-arm64`, and there's no system browser. UI
  changes are verified via typecheck/lint/tests/(build when safe) plus
  tracing the actual data flow in code, never a screenshot. The user
  verifies visually herself through VSCode's auto-forwarded port 3000
  (Ports tab → open in her own browser) — that's unaffected by the
  container's own browser limitation.
- **Dev server is currently running**: pid ~468290 (`next dev`), port
  3000, logging to this session's scratchpad path above. A fresh session
  should check for an already-running server (`ss -ltnp | grep 3000`)
  before starting a new one — starting a second one on the same port will
  fail or, worse, silently confuse which one is being edited.

## 4. Backlog & Deferred Items

1. **Home page curtain banner copy** — user wants to edit the wording,
   not started. See §5 for exactly what to change.
2. `league-rosters-card.tsx` ("Dance Cards" on Standings) still shows only
   a bare dimmed "Eliminated" label with no "Safe" badge at all, so it
   didn't get the same In Jeopardy pill treatment `roster-card.tsx` got
   this session. Optional future consistency pass, not requested yet.
3. Carried over from before this session, still low-priority/optional:
   a mid-season backfill helper for In Jeopardy marks; a commissioner-facing
   "who got In Jeopardy credit this week" glance on Publish.

## 5. Next Steps

1. **Edit `statusCopy()` in `src/components/episode-banner.tsx`** (around
   line 16) per whatever new wording the user wants. Current 3(–4) states,
   for reference:
   - `on_air` + Curtain Call on somewhere → title **"On Air Now"**, sub
     **"Picks are locked"**.
   - `on_air` + Curtain Call off everywhere → title **"On Air Now"**, no
     subtitle.
   - `picks_open` + Curtain Call on → title **"Picks open"**, sub
     **"Airs {date/time}"**.
   - `picks_open` + Curtain Call off → no title at all, just
     **"Airs {date/time}"**.
   - (Separately, the whole banner doesn't render when there's no live
     week — that check lives in the parent, not in `statusCopy()`.)
2. No other work is queued. Check with the user for what's next.
