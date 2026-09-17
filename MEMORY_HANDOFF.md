# Session Handoff

## 1. Current State

Draft PR **#12** (`cursor/unify-episode-labels-7d68` → `main`): **two-tier episode labels**, rebased onto #11. Admin stays on `formatEpisodeLabel` (`S35 E02`). Fan tabs use casual `Episode N` / `Ep. N` / `Ep. N — {theme}`. Do not merge from this session.

## 2. Changes Made

Owner reversed the all-`S35 E02` fan approach. Helpers in `src/lib/format-week.ts`:

- **Admin / site-ops:** `formatEpisodeLabel` → `S35 E02` (Schedule, Enter Results, Correct, All Results, Season Clock).
- **Fan roomy:** `formatEpisodeCasual` → `Episode 2` (Home spoiler, Mark as watched, This Week pending-reveal teaser).
- **Fan tight:** `formatEpisodeCasualShort` → `Ep. 2` (week switcher chip, Standings `through Ep. 2`, Grand Finale status).
- **Fan + theme:** `formatEpisodeCasualWithTheme` → `Ep. 2 — Latin Night` (This Week header, switcher list, Your Picks **subtitle**).

Your Picks after #11: section label **Curtain Call**; card title **This week's picks**; casual `Ep. N` (or `Ep. N — theme`) lives in the description with the lock line. Do not put episode in a `Curtain Call — …` card title.

Season Clock still uses `formatEpisodeLabel` — PR **#7** lock labeling is untouched.

**Verification:** pending rebase wrap-up (lint / test / build). Live spoiler-free account still needs Vercel preview.

## 3. Key Decisions & Lessons Learned

- Season number is ops-only on fan tabs; don’t thread `seasonNumber` into Home / This Week / Your Picks / Standings just to format a label.
- Relative copy (`This week` tab, `N wk behind`) stays relative. Product module names stay on section labels (#11).

## 4. Backlog & Deferred Items

- Season Clock lock labeling lives in PR #7.
- Carry-forward: Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated-couple clamp; feature-announcement mechanism; live spoiler-free Vercel preview.

## 5. Next Steps

1. Phone-width Vercel preview: Home spoiler `Episode N results are in`; This Week `Ep. N` / `Ep. N — theme`; Mark `Episode N`; Standings `through Ep. N`; Your Picks title **This week's picks** with `Ep. N` in the subtitle.
2. Review/merge #7 for Season Clock locks (still official `S35 E0x`).
