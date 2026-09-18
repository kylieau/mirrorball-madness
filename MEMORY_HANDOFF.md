# Session Handoff

## 1. Current State

Account Settings sheet reorder (owner choice A) on branch `cursor/reorder-account-settings-sheet-58b8`, from latest `main`. Draft PR only — do not merge from the agent.

## 2. Changes Made

- `src/components/account-settings-sheet.tsx` row order is now: Profile, Spoiler-Free, Notifications, Add to Home Screen, Appearance (coming soon), Account & data. Site Admin and Sign out stay below.
- `BACKLOG.md` **Account-nav follow-up edits**: noted order A shipped; no further account-nav edits queued.

## 3. Key Decisions & Lessons Learned

- Fallback `/settings` page was left unchanged — this request was sheet-only, no other product changes.

## 4. Backlog & Deferred Items

- **Account-nav follow-up edits** — order A shipped; nothing else queued there.
- **Actually deleting** `auth.users` / profiles / league history — still no safe automatic path.
- Auto-draft later niceties: countdown + nudge before first auto; pause if half the league ghosts; seeded RNG; undo after draft complete.
- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results and public Results. Do not invent a fake production row.
- League-wide miss-rate board and bottom-two / “almost had it” remain out of scope for Past picks.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Feature-announcement infra.

## 5. Next Steps

1. Confirm the Settings sheet rows match order A on a phone/preview.
2. Merge when ready — do not merge from the agent.
