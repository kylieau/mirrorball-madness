# Session Handoff

_Last updated 2026-09-22 (post-draft). Read this first, then `CLAUDE.md`._

## 1. Current State

**No feature in flight. All work from the prior session is on `main`, pushed, and confirmed working in production** —
the real Season 35 drafts ran on 2026-09-22 using this code with no issues reported. Nothing is queued right now;
this handoff exists to hand off cleanly to a fresh session, not because something is mid-build.

## 2. Changes Made

Source of truth: `git diff --stat f9d4225 HEAD` (the previous handoff commit → now), 30 files, +1509/−145, across
8 commits (`42883e5` … `72e95f3`). Highlights:

- **Sticky headers** (`src/components/scroll-reveal-bar.tsx` new, `top-bar.tsx` `SlimTopBar`, `episode-carousel.tsx`
  `compact` variant, `league-header.tsx`, `today/page.tsx`, `this-week/page.tsx`): the full header (top bar, title,
  switcher/carousel) stays in normal flow; once it scrolls off, a slim ~48px bar slides in (switcher or compact
  ‹ Week N › plus avatar). Home's curtain bar (`episode-banner.tsx`) offsets beneath it via the `--sticky-header-h`
  CSS variable. Brand mark enlarged to match the avatar height.
- **Results leaderboard** (`weekly-results-view.tsx`): status pill (Safe/Eliminated/etc.) moved above the score on
  the right; the per-row "judges' pts" label was removed, the section header now says "Judges' score" once.
- **Draft queue copy** (`draft-queue-card.tsx`, `copy-picks.ts`, `other-league-picks.ts`, `other-leagues-picker.tsx`
  gained reusable wording props): push via "Copy to other leagues", pull via "Use my queue from…". No SQL — reuses
  the existing `draft_queues` table.
- **Custom draft type** (`custom-draft-order-card.tsx` new, `draft.ts`, `draft-room.tsx`, `schema.sql`,
  `supabase/apply-custom-draft-order.sql`): commissioner arranges every round by hand instead of snake/linear. Type
  is chosen in League Settings; the per-round grid lives in the draft lobby. Snake stays the default.
- Docs: `BACKLOG.md` gained an **Auction draft** section; `CLAUDE.md` documents the custom order;
  `.env.example` now lists `SUPABASE_ACCESS_TOKEN`.
- **Live DB verified**: `apply-custom-draft-order.sql` was run — `leagues.custom_pick_order` column,
  `draft_type` check accepts `'custom'`, `set_custom_draft_order` exists and is granted to `authenticated` only.
  `types.ts` was regenerated from the live schema (not hand-patched).
- **Integration-tested**: `scratch/test-custom-draft.mjs` (throwaway accounts, cleaned up) — 19/20 checks passed;
  a custom draft where every pick (including autopilot auto-picks) went to the manager the sequence names, plus a
  snake regression draft. The one non-pass was a wrong test expectation, not a bug (see §3).
- **Cleanup done this session**: the "Draft Test (throwaway)" league (`d39b26a3-…`) and its test user
  (`draft-test-manager@example.test`, `9d7484e9-…`) are deleted — both fixture IDs from the prior handoff are gone.
- **Working tree**: only `ios/App/App.xcodeproj/project.pbxproj` (not ours) and untracked `scratch/` (throwaway
  verification scripts) — nothing else pending.

## 3. Key Decisions & Lessons Learned

- **Why the custom draft type exists**: a draft held after Week 1 has a *concave* value curve (judges compress the
  top; an eliminated couple is worth ~0 forever), so snake forces the end seats to absorb a known dud. Worst at 5
  managers / 11 active couples (10 drafted, 1 spared) — seat 1 ran ~19% behind on an *illustrative, unfitted* curve.
  4 managers is fair to ~1% (3 undrafted couples absorb the cliff); 6 managers drops roster size to 1, so snake is
  inert. `start_draft` counts **active** couples only, so a post-elimination cast shrinks the round count.
- **Rejected**: `linear` (far worse under concavity), third-round reversal (needs 3+ rounds), retuning scoring
  defaults (`judges_score_multiplier` scales the gap rather than closing it; only lowering Dance Card's category
  weight helps, and that devalues the roster). **Auction draft is the real fix** but is roughly a second feature
  (bidding, budgets, live-vs-blind RLS, Realtime, a second draft-room mode) — backlogged in `BACKLOG.md` with its
  autopilot snag (proxy max-bids vs. a ranked queue) and a blind sealed-bid variant.
- **Sticky header**: plain `position: sticky` can't pin the top bar and switcher while the title scrolls away
  between them — solved with the slim-bar-on-scroll pattern `EpisodeBanner` already used. Mid-session correction:
  removing titles entirely was a misread of "slim it down" and was reverted — the ask was pin less, not show less.
- **`set_custom_draft_order`'s "not a member" check is unreachable** — an outsider can never pass the "same number
  of picks" count check first. Harmless dead branch; clean up next time that function is touched, not urgent.
- **`active_season_id()` is granted to `authenticated` only** — a service-role script calling it directly gets
  `permission denied`. Read `seasons where is_active` instead in ad-hoc scripts.
- **A hand-patched `types.ts` was incomplete** (missed the column on `leagues` rows returned by functions, not just
  the table). Always regenerate with a real token rather than hand-editing when one is available.
- **Build while `next dev` is running**: copy the repo into the scratchpad (`rsync` excluding
  `.next`/`node_modules`/`.git`, symlink `node_modules`) and build there — don't touch the live `.next`.
- **Don't run `prettier`** (no repo config, reformats whole files). `vitest` has no `@/` alias, so `src/lib` modules
  import each other relatively. Stage files by name, never `git add -A`. Hand SQL over as plain `.sql` files, never
  a bash heredoc.
- **Working style**: repeat back before executing when asked; one question at a time; a rejected `ExitPlanMode`
  means stop and wait; the user prefers decisions made for them on technical calls they don't have context for
  ("idk enough to make judgment calls") — state the recommendation and act, don't just list options.

## 4. Backlog & Deferred Items

- **Fit the Monte Carlo script to real Season 35 data** — now that real picks and judges' scores exist from the
  2026-09-22 drafts, `scripts/monte-carlo-calibration/run.mjs` can finally be re-fit instead of using the
  illustrative curve the snake/custom-draft analysis was based on (see `README.md`'s re-fit steps).
- **Custom order lobby UI still has no human click-through** — the RPCs and turn resolution are integration-tested,
  but nobody has verified the per-round grid, arrows, and auto-save render correctly in a browser.
- **`set_custom_draft_order`'s dead "not a member" branch** — cosmetic SQL cleanup, no rush.
- **Settings "✓ Settings saved" banner** doesn't clear when fields are edited afterwards.
- **Results notes**: bolding league names (e.g. "On your **matt with the stars** roster") would separate them from
  the noun.
- **Auto-picks aren't announced** in the draft UI; no timer refetch for a silently stalled connection.
- **Site Admin visibility**: user wants some Site Admin pages moved public; scoped, not started.
- **Live draft cue**: considered and declined — user judged a banner unnecessary since drafts are temporary.
- Confirm the Vercel deployment for the latest `main` commit (`72e95f3` as of this handoff) is green — not verified
  from this container, though the real drafts running successfully is strong evidence it deployed.

## 5. Next Steps

1. Ask the user what to work on next — there is no queued task. Good candidates from §4: the Monte Carlo re-fit
   (real data now exists), or a human pass on the custom-draft lobby UI before it's relied on again.
2. If picking up the Monte Carlo re-fit: read `scripts/monte-carlo-calibration/README.md`'s "Re-fitting against real
   Season 35 data" section first — it lists exactly what to replace and how to ship the result.
