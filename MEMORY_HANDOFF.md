# Session Handoff

## 1. Current State

Season Clock lock-label fix is on `cursor/season-clock-lock-episode-5c30` (draft PR #7 into `main`). Rebased onto latest `main` (after #6 / #8–#14). No schema change. Do not merge from the agent.

Admin / League Settings Season Clock still uses `formatEpisodeLabel` (`S35 E0x`) — that is the correct tier here, not the fan `Episode N` / `Ep. N` helpers from #12.

## 2. Changes Made

Reported symptom: League Settings showed **Anchor week = S35 E01** but **Currently locks = 9/29** (E03's air date).

Not an off-by-two lookup. `effective_grand_finale_deadline` correctly reads `airs_at` for `effective_hard_deadline_week`. **Anchor week** is the stored `judges_score_starts_week`; **Currently locks** is the *effective* week, which auto-advances to the next unaired episode while Dance Card is on and the draft is still open. The UI put those two side-by-side and the copy said they were the same episode, so E01 + 9/29 looked like a wrong-episode bug.

- Settings now fetches `effective_hard_deadline_week` plus each episode's `airs_at`.
- "Currently locks" / Grand Finale Deadline render as `S35 E03 · {datetime}` (looked up from that week's episode row).
- Helper copy explains the roll-forward when anchor and lock weeks differ; Dance Card-off copy no longer mentions draft auto-advance.
- Pure-logic helpers in `src/lib/season-clock.ts`.

If the lock line still says **S35 E01 · 9/29**, the mismatch is Admin → Schedule (E01's `airs_at`), not this path.

## 3. Key Decisions & Lessons Learned

- Do not change SQL: auto-advance for an open Dance Card draft is intentional (and the Dance Card-off freeze in `effective_hard_deadline_week` is the correct complementary path).
- Label the lock with its episode. A bare date next to a different episode selector is indistinguishable from a lookup bug.
- Season Clock is admin/settings copy, so it keeps `S35 E0x` even after fan tabs switched to Episode N.

## 4. Backlog & Deferred Items

Carried forward (untouched):

- Home season strip (#14) and Past picks vs results (#10) — owner-approved, not started.
- View Results / This Week "DND" / "—" display still needs a real published Did Not Dance couple.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

A2HS (#6) is on `main`.

## 5. Next Steps

1. Coordinator: phone (~390px) preview of League Settings → Season Clock (click-path is in the PR). Do not merge from the agent.
2. If the labeled lock is still E01 on 9/29, check Admin episode air dates.
