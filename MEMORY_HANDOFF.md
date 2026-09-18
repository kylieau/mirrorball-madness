# Session Handoff

## 1. Current State

Account-deletion **queue** v1 on branch `cursor/account-deletion-queue-3328` (from latest `main` after auto-draft PR #25). Surfaces pending `profiles.deletion_requested_at` rows to super-admins. Does **not** delete auth users or cascade-wipe leagues. Do not merge from the agent.

## 2. Changes Made

- Super-admin page `/admin/accounts`: email, display name, requested-at, user id. Gate is `profiles.is_super_admin` only (not `RESULTS_ENTRY_OPEN_TO_ALL`).
- Settings + Account Settings sheet: Site Admin is two rows — Results and Accounts. UI label is **Accounts** (route stays `/admin/accounts`).
- Super-admin **Clear request** nulls `deletion_requested_at` via the service-role client after an `is_super_admin` check. Does not call `cancel_account_deletion` (that RPC is self-only / `auth.uid()`).
- Dashboard SQL: `supabase/queries/pending-account-deletions.sql`.

## 3. Key Decisions & Lessons Learned

- Email lives on `auth.users`, and profiles RLS is owner/league-member only, so the queue read uses the admin client after the super-admin check.
- `cancel_account_deletion` cannot clear another user's request; a new RPC was not added (no dashboard SQL apply required for v1).
- Actual account wipe is still unsafe: league history FKs do not cascade off profiles.

## 4. Backlog & Deferred Items

- **Actually deleting** `auth.users` / profiles / league history — still no safe automatic path.
- Auto-draft later niceties: countdown + nudge before first auto; pause if half the league ghosts; seeded RNG; undo after draft complete. Production still needs `supabase/apply-auto-draft.sql` applied if not already.
- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results and public Results. Do not invent a fake production row.
- League-wide miss-rate board and bottom-two / “almost had it” remain out of scope for Past picks.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Feature-announcement infra.

## 5. Next Steps

1. Phone-review as a super-admin: Settings → Site Admin → Accounts; request deletion from a throwaway account and confirm it appears; Clear request; confirm non-super-admin is redirected.
2. Optional: run the SQL in the Supabase SQL Editor to confirm it matches the UI.
3. Merge when ready — do not merge from the agent.
