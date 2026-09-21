# Session Handoff

_Last updated 2026-09-21 (late night). Real drafts are 2026-09-22. Read this first, then `CLAUDE.md`._

## 1. Current State

**No feature in flight; everything is on `main` and pushed.** This session shipped four things, all live-verified where
they touch the DB: (a) sticky headers, (b) Results leaderboard tweaks, (c) copying the draft queue across leagues, and
(d) a `custom` draft type. `tsc`, eslint and `npm test` (307) are clean and a production build passed in a scratchpad copy.

Live DB is current: `supabase/apply-custom-draft-order.sql` was run and verified (column `leagues.custom_pick_order`,
`draft_type` check accepts `'custom'`, `set_custom_draft_order` exists and is granted to `authenticated` only).
`types.ts` was regenerated from the live schema. All six leagues are still `snake` / `not_started`.

An end-to-end integration test (`scratch/test-custom-draft.mjs`, throwaway accounts, fully cleaned up) passed 19/20: a
custom draft where every pick, including autopilot auto-picks, went to the manager the sequence names, plus a snake
regression draft that still works. The one "failure" was a wrong expectation in the test (see §3), not a bug.
**Not tested:** the lobby UI itself (the per-round grid, arrows, auto-save).

## 2. Changes Made

- **Sticky headers** (`scroll-reveal-bar.tsx`, `top-bar.tsx` `SlimTopBar`, `episode-carousel.tsx` `compact`): the full header
  (top bar, title, switcher/carousel) stays in flow; once it scrolls off, a slim ~48px bar slides in (switcher or compact
  ‹ Week N › plus the avatar). Home's curtain bar offsets beneath it via the `--sticky-header-h` CSS variable. Brand mark is
  enlarged to match the avatar height.
- **Results leaderboard** (`weekly-results-view.tsx`): status pill moved above the score on the right; the per-row
  "judges' pts" label was removed and the header now says "Judges' score" once.
- **Draft queue copy** (`draft-queue-card.tsx`, `copy-picks.ts`, `other-league-picks.ts`): push ("Copy to other leagues") and
  pull ("Use my queue from…"). No SQL.
- **Custom draft type** (`custom-draft-order-card.tsx`, `draft.ts`, `draft-room.tsx`, `schema.sql`): commissioner arranges every
  round by hand. Type is chosen in League Settings; the per-round grid is in the draft lobby. Snake stays the default.
- `BACKLOG.md` has a new **Auction draft** section; `CLAUDE.md` documents the custom order; `.env.example` lists
  `SUPABASE_ACCESS_TOKEN`.

## 3. Key Decisions & Lessons Learned

- **Why custom exists:** a draft held after Week 1 has a *concave* value curve (judges compress the top; an eliminated couple
  is worth ~0 forever), so snake makes end seats absorb a known dud. Worst at 5 managers / 11 active couples (10 drafted, 1
  spared): seat 1 ~19% behind on an *illustrative, unfitted* curve. 4 managers is fair to ~1% (3 undrafted absorb the cliff);
  6 managers drops to roster 1 so snake is inert. `start_draft` counts **active** couples, so post-elimination casts shrink.
- **Rejected:** `linear` (far worse under concavity), third-round reversal (needs 3+ rounds), retuning scoring defaults
  (`judges_score_multiplier` scales the gap rather than closing it; only lowering Dance Card's category weight helps, which
  devalues the roster). **Auction draft is the real fix** but is roughly a second draft feature; it is backlogged with its
  autopilot snag (proxy max-bids vs a ranked queue) and a blind sealed-bid variant.
- **Sticky header:** plain `position: sticky` can't pin the top bar and switcher while the title scrolls away between them.
  The slim-bar-on-scroll pattern (already used by `EpisodeBanner`) solves it. "Title visible" and "controls pinned" were both
  wanted; removing titles entirely was a misread and was reverted.
- **`set_custom_draft_order`'s "not a member" branch is unreachable:** an outsider can never pass the "same number of
  picks" count check first. Harmless dead SQL; clean it up after the drafts rather than change live SQL now.
- **`active_season_id()` is granted to `authenticated` only** — a service-role script calling it gets `permission denied`.
  Read `seasons where is_active` instead in ad-hoc scripts.
- **A hand-patched `types.ts` was incomplete** (the generator also adds the column on `leagues` rows returned by functions).
  Regenerate rather than hand-edit.
- **Build while `next dev` is running:** copy the repo into the scratchpad (`rsync` excluding `.next`/`node_modules`/`.git`,
  symlink `node_modules`) and build there. Don't touch `.next`.
- **Don't run `prettier`** (no repo config, reformats whole files). `vitest` has no `@/` alias, so `src/lib` modules import
  each other relatively. Stage files by name, never `git add -A`. Hand SQL over as plain `.sql` files.
- **Working style:** repeat back before executing when asked; one question at a time; a rejected `ExitPlanMode` means stop and
  wait; the user prefers decisions made for them on technical calls ("idk enough to make judgment calls").

## 4. Backlog & Deferred Items

- **Confirm Vercel deployed** the latest `main` commit (past builds broke silently) — check the Deployments list.
- **Custom order lobby UI is untested by a human** — try it in a throwaway league, then switch back to Snake.
- **Fit the Monte Carlo to real Season 35 judges' scores** and report manager points by draft slot (snake vs linear vs custom)
  before any scoring-default change (`scripts/monte-carlo-calibration/README.md`).
- **Throwaway fixtures may still be live:** league "Draft Test (throwaway)" (`d39b26a3-1076-48d0-b07e-2a143acf31f7`) and auth user
  `draft-test-manager@example.test` (`9d7484e9-8199-4427-89db-56a72d6b9afe`). Delete the league first (cascades), then the user.
- The Supabase token that was pasted in an earlier chat is revoked, as is the one used to regenerate types this session.
- **Live draft cue:** the user decided a banner isn't needed (drafts are temporary).
- **Settings "✓ Settings saved" banner** doesn't clear when fields are edited afterwards.
- **Results notes:** bolding league names would separate them from the noun.
- **Auto-picks aren't announced** in the draft UI; no timer refetch for a silently stalled connection.
- **Site Admin visibility:** the user wants some Site Admin pages moved public; scoped, not started.

## 5. Next Steps

1. Watch the real drafts on **2026-09-22**; check the Vercel deploy is green beforehand.
2. After the drafts: delete the throwaway league/user, and consider the Monte Carlo fit.
3. Pick the next task from §4.
