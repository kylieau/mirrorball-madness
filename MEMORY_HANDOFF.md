# Session Handoff

## 1. Current State

Draft PR off latest `main`: drop unused `/notifications` `rankBadge` so Spoiler-Free cannot leak via the notifications summary. Branch `cursor/drop-notifications-rank-badge-99fd`. Do not merge from the agent.

## 2. Changes Made

- `src/lib/league-summary.ts`: removed `rankBadge` from `LeagueSummary` / `computeLeagueSummary`. Dropped the `getRankBadge` / `NEUTRAL_BADGE` import and the `league_members` + `weekly_manager_scores` queries that existed only to compute it. Notifications still uses `needsAttention` / `statusText` / `name` only.
- `BACKLOG.md` Notifications: marked the `rankBadge` leak done. Home ranking (`league-home-summary.ts` + `rank-badge.ts`) left intact.

## 3. Key Decisions & Lessons Learned

- Prefer deleting the unused field over wiring spoiler cutoff into a value nobody displays. If Notifications ever needs a rank badge later, compute it the Home way (`resolveSpoilerCutoff` / `allowedEpisodeIds`) — do not resurrect the all-scores path.

## 4. Backlog & Deferred Items

- League-wide miss-rate board and bottom-two / “almost had it” remain out of scope for Past picks.
- **DND / "—" live check** — still owed. Human publishes one Did Not Dance couple, then confirms Admin → View Results and public Results. Do not invent a fake production row.
- Full season schedule dump / a schedule-detail page / lock-time hint / Home timeline — still out of scope.
- Recast/waivers spoiler framing; roster-eliminated clamp; feature-announcement infra.
- `/notifications` `rankBadge` leak — done (this PR).

## 5. Next Steps

1. Merge this PR when ready — latent leak cleanup, not a visible UI change.
2. Do not merge from the agent.
