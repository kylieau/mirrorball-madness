# MEMORY_HANDOFF

Session handoff for Claude Code / next eng session. Updated 2026-09-22 (PT) after In Jeopardy landed on `main`.

## 1. Current state

**In Jeopardy (Curtain Call near-miss) is merged to `main`** via squash PR [#33](https://github.com/kylieau/mirrorball-madness/pull/33) (`581b85b`). Code + hand-updated types are on `main`; **live Supabase still needs the owner apply SQL** before Enter Results / Results / league queries against the new tables will work.

**Actively next for eng (owner choice):** continue In Jeopardy polish / wiring from Claude on `main`, **or** spoiler-free + Results badge hardening (plan drafted in Push Pilot chat, not built).

Repo: `kylieau/mirrorball-madness` (Next.js + Supabase + Vercel). Personal lane only — no Lotus.

## 2. Changes made (this session — source of truth: merge commit `581b85b`)

`git` equivalent: commit `581b85b` — **+1185 / −180** across **27 files**.

| Path | Change |
|------|--------|
| `CLAUDE.md` | modified |
| `MEMORY_HANDOFF.md` | modified (agent session notes; this file supersedes) |
| `src/app/admin/results/page.tsx` | modified |
| `src/app/leagues/[id]/page.tsx` | modified |
| `src/app/leagues/[id]/settings/actions.ts` | modified |
| `src/app/this-week/page.tsx` | modified |
| `src/components/all-results-view.tsx` | modified |
| `src/components/league-modules-form.tsx` | modified |
| `src/components/past-picks-card.tsx` | modified |
| `src/components/pick-em-box.tsx` | modified |
| `src/components/results-form.tsx` | modified |
| `src/components/results-screen.tsx` | modified |
| `src/components/weekly-results-view.tsx` | modified |
| `src/lib/in-jeopardy.test.ts` | **added** |
| `src/lib/past-picks.test.ts` | modified |
| `src/lib/past-picks.ts` | modified |
| `src/lib/results-draft.ts` | modified |
| `src/lib/results-outcome.test.ts` | **added** |
| `src/lib/results-outcome.ts` | **added** |
| `src/lib/results-page-data.ts` | modified |
| `src/lib/results.ts` | modified |
| `src/lib/scoring.test.ts` | modified |
| `src/lib/scoring.ts` | modified |
| `src/lib/season-clock-sync.ts` | modified |
| `src/lib/supabase/types.ts` | modified (hand-updated; regen after SQL) |
| `supabase/apply-curtain-call-in-jeopardy.sql` | **added** — **owner must run in Supabase SQL Editor** |
| `supabase/schema.sql` | modified |

Also this Push Pilot chat (not in that commit): spoiler-free + In Jeopardy badges **plan only** (no code).

## 3. Key decisions & lessons

### In Jeopardy product (locked)

- Elim near-miss = **manual In Jeopardy ticks** on Enter Results (TV called-down group), **not** judges bottom-N.
- Top-scorer near-miss = within **1 point** of week high `M` → `[M−1, M)`; ties at `M` = exact only; **not** top-3.
- Credit = **`floor(exactPayout × 0.25)`** for **both**; exact always wins; double-elim wrongs pay **independently**.
- Default **on**; mid-season backfill OK; **not retroactive** on `weekly_manager_scores`.
- Results: In Jeopardy **overrides Safe** for marked non-elim; branding stays “In Jeopardy”.
- Preview: floored pts; elim line qualitative until marks exist (`… pts if In Jeopardy`).
- Settings: on/off only; **hardcode 25%**; Season Clock locks the toggle.
- Dropped: auto bottom-N, band-size knob, 33%, top-3, Settings essay.

### Eng / process

- Prefer Cursor cloud agents for repo PRs; owner may continue on Claude Code / VS locally after merge.
- Prefer Supabase SQL Editor over hunting local `.env`.
- Usual Mirrorball rule was phone UX sign-off before merge; owner **explicitly** asked to land #33 on `main` to unblock Claude — exception for this PR.
- Types in #33 were hand-updated (no `SUPABASE_ACCESS_TOKEN` in cloud). After apply SQL, regen:  
  `npx supabase gen types typescript --project-id wssbwgtsejamlbvfofvu --schema public > src/lib/supabase/types.ts`
- Until apply SQL runs, live click-through of new tables will fail.

### Spoiler-free + badges (plan, not built)

- Week cutoff (`resolveSpoilerCutoff`) already hides unwatched weeks; couple clamp (`spoilerSafeCoupleStatus`) avoids differential tags.
- In Jeopardy is **episode marks**, not `couples.status` — roster Safe/Elim tags must **not** show In Jeopardy for unwatched weeks (clamp to Safe).
- Shared tag helper for Results + roster; admin exempt; Eliminated banner stays elim-only (badge-only for In Jeopardy unless owner asks for a strip).
- Open Qs from plan: roster show In Jeopardy after watch (parity) vs Results-only; callout strip vs badge-only; follow-up PR vs fold-in.

## 4. Backlog & deferred

1. **Run** `supabase/apply-curtain-call-in-jeopardy.sql` in Supabase (blocking for live In Jeopardy).
2. **Regen** `src/lib/supabase/types.ts` after SQL (if hand types drift).
3. **Spoiler-free + In Jeopardy badges** — plan drafted; build when green-lit.
4. **Enter Results UX polish** — top product backlog after In Jeopardy is live/usable (parked dissatisfaction from Phase 2).
5. **Equal-EV / neutral fair scoring defaults** — still parked after Enter Results UX.
6. Optional later: mid-season backfill marks; commissioner “did anyone get In Jeopardy credit?” glance on publish.
7. Fantasy / Mirrorball **strategy** (GF picks, hedges) → **Personal Poké**, not Push Pilot.
8. PR #32 Enter Results backlog docs — may still be open/unmerged from earlier; not this session’s focus.

## 5. Next steps (do these first in a fresh session)

1. `git pull` on `main` (includes #33).
2. Owner: paste/run **`supabase/apply-curtain-call-in-jeopardy.sql`** in Supabase SQL Editor.
3. Optionally regen types (command above).
4. Smoke Enter Results (In Jeopardy ticks) → publish → Results badges + past-picks / pick-em preview on a Vercel prod/preview build.
5. Then either: Claude polish on In Jeopardy gaps found in smoke, **or** implement spoiler-free badge clamp per plan (open Qs above).

Push Pilot remains available for cloud PRs / merges; one Push Pilot chat for personal eng unless a hard wall is needed.
