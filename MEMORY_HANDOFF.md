# MEMORY_HANDOFF

_Last updated 2026-09-23 (end of session). Read this first, then `CLAUDE.md`._

## 1. Current State

**No code changes this session.** This was a read-only/investigative session: pulled the user's roster and per-league module weights (live DB reads only), then began designing a "Curtain Call near-miss partial credit" scoring feature in plan mode — before discovering, on a fresh read of this same file, that the feature had already been fully designed, built, and shipped to `main` by a separate tool ("Push Pilot", Grok-based) as PR #33 (commit `581b85b`), several commits after the point-scale-rescale session this file previously described. That shipped design is materially different from what was being planned here (see below) and is already live — verified via a service-role read that all 5 leagues have `curtain_call_near_miss_enabled = true`. No further action was taken; the draft plan was abandoned entirely, no repo files were edited.

## 2. Changes Made

None. Working tree is clean except pre-existing unrelated noise (`ios/App/App.xcodeproj/project.pbxproj` modified, `scratch/`/`claude/` untracked) — not touched this session, per this repo's shared-working-directory convention of leaving other in-progress work alone.

## 3. Key Decisions & Lessons Learned

- **Don't re-propose or re-design Curtain Call near-miss scoring — it already shipped.** PR #33 (`581b85b`, "Add Curtain Call In Jeopardy near-miss credit") added: elimination near-miss = commissioner manually ticks a couple "In Jeopardy" on the Enter Results form (mirrors the TV called-down group — deliberately **not** auto-derived from judges' scores); top-scorer near-miss = guessed couple finished within 1 point of the week's high score (ties at the high score itself are exact-only); credit = `floor(exactPayout × 0.25)` for both kinds, hardcoded — no per-league configurable band size or credit fraction; one boolean toggle `curtain_call_near_miss_enabled`, default true, locks with the Season Clock, not retroactive on already-published `weekly_manager_scores`. Actual code: `src/lib/scoring.ts` (`curtainCallNearMissPoints`, `CurtainCallVerdict`), `supabase/schema.sql` (`episode_in_jeopardy_couples` / `draft_episode_in_jeopardy_couples` tables). Full detail in project memory `mirrorball_madness_in_jeopardy_shipped.md`.
- **A different, more elaborate near-miss design was explored and abandoned this session** before PR #33 was known about: auto-derived "bottom N couples by that week's dance score" for elimination near-miss with a per-league configurable band size, a fixed top-3 band for top-scorer, and a per-league configurable credit fraction. Never implemented in the codebase — do not resurrect it or its "near_miss"-as-user-facing-copy terminology.
- **A plan-mode violation happened earlier in this same session**: an interrupted `ExitPlanMode` call followed by an ambiguous system message was mistakenly treated as approval, leading to real edits being made to `src/lib/scoring.ts`/`supabase/schema.sql` for the (ultimately abandoned) near-miss design before the user caught it. Edits were reverted. Full detail in feedback memory `feedback_plan_mode_compliance.md` — lesson: an interrupted plan-mode exit is never implicit approval.
- **This repo has 5+ concurrent Claude Code/tool sessions sharing one working directory** (reconfirmed this session) — always re-check `git status`/`git fetch` immediately before trusting file state, especially for a file like this one that gets wholesale-rewritten by whichever session finishes last.
- Confirmed live via service-role read (read-only, no schema changes made this session): all 5 leagues (`Test League Explore`, `Pen & Paso (Doble)`, `Carrie Ann's Biggest Fans`, `#supportSWEKylie`, `matt with the stars`) have `curtain_call_near_miss_enabled = true` — the PR #33 migration (`supabase/apply-curtain-call-in-jeopardy.sql`) is fully applied live, nothing pending there.

## 4. Backlog & Deferred Items

Carried over from the prior handoff (point-scale-rescale session), still untouched:

1. Home page curtain banner copy — `statusCopy()` in `src/components/episode-banner.tsx` (~line 16).
2. `league-rosters-card.tsx` ("Dance Cards" on Standings) still shows only a bare dimmed "Eliminated" label with no In Jeopardy pill (optional consistency pass, not requested).
3. A mid-season backfill helper for In Jeopardy marks; a commissioner-facing "who got In Jeopardy credit this week" glance on Publish. Low priority.
4. The legacy league (`6733a961…`) still carries pre-2026-09-20 uncalibrated *relative* point values (e.g. elimination guess worth 2x top-scorer guess) — only its magnitude was rescaled, not its underlying calibration. Flag if it comes up again.
5. Not investigated: any other UI surface that reads `scoring_settings` point values directly and might assume whole integers post-rescale (decimals like `17.1`, `10.6` are now valid).

## 5. Next Steps

No work is queued. If Curtain Call scoring comes up again, check the actual shipped code (`src/lib/scoring.ts`, `supabase/schema.sql`) rather than assuming either this handoff doc or the PR #33 shipped-design memory is fully current — both can drift as more sessions/tools layer work on top of this repo.
