# Session Handoff

## 1. Current State

Randomized auto-draft v1 on latest `main` (after design-notes PR #24). Branch `cursor/randomized-auto-draft-53b6`. SQL must be applied via `supabase/apply-auto-draft.sql` before production use. Do not merge from the agent.

## 2. Changes Made

- Server-authoritative pick clock (`leagues.current_turn_started_at`) reset after every pick.
- `make_auto_draft_pick` places one uniform-random eligible remaining couple when the clock expires or the on-clock manager has `draft_autopilot`. Any league member can invoke it (never-joined path). Does not start a draft.
- Draft log labels auto-picks `auto · random`. Sit-out toggle in the draft room. Commissioner `undo_last_auto_pick` for the latest auto-pick while the draft is in progress.
- Testable helpers in `src/lib/draft.ts` (`pickRandomEligible`, clock, trigger). Client hook `useAutoDraftPick` on the draft room and the Picks draft-status card.

## 3. Key Decisions & Lessons Learned

- Random choice lives in SQL (`order by random()`) so a client cannot inject a skill pick. The TS helper is the same rule with an injectable RNG for tests.
- One RPC call = one pick. Timeout never chains; autopilot chains with a 1s client delay so the log stays visible.
- Never-joined uses the same timeout clock rather than an immediate pick, so starting the draft cannot instantly drain absentees.

## 4. Backlog & Deferred Items

- Auto-draft later niceties: countdown + nudge before first auto; pause if half the league ghosts; seeded RNG; undo after draft complete.
- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results and public Results. Do not invent a fake production row.
- League-wide miss-rate board and bottom-two / “almost had it” remain out of scope for Past picks.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Feature-announcement infra.

## 5. Next Steps

1. Run `supabase/apply-auto-draft.sql` in the Supabase SQL Editor.
2. Phone-review a live draft: timeout auto-pick, autopilot toggle, undo, confirm Start draft is still a commissioner action.
3. Merge when ready — do not merge from the agent.
