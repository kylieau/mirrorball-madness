# Session Handoff

## 1. Current State

Hide-eliminated-from-schedule is on `cursor/hide-eliminated-schedule-2d26` (PR into `main`). No schema change.

## 2. Changes Made

Decision: unpublished admin pickers use the still-competing cast only; published weeks keep whoever was still in as of that week.

- New helpers in `src/lib/episode-cast.ts` (`selectableCast`, `defaultCheckedParticipantIds`, `participantIdsToPersist`, `resultsEntryCoupleIds`).
- **Edit Scheduled Episode / Schedule a New Episode**: "Who's Performing?" lists only the selectable cast for that week. Saved `episode_participants` IDs that are already gone are dropped (unchecked / omitted), not rewritten.
- **Enter Results**: upcoming weeks hide departed couples even if a stale draft still names them (next save trims the draft). Published / correction weeks still show the couple who went home that night.
- **Publish**: after `couples.status` updates, prune those IDs from *unpublished future* `episode_participants` and draft rows so they don't haunt next week's lists. Past published weeks are left alone.
- Admin couples + episodes queries are scoped to the active season (same butterfly — leftover seasons were leaking into those lists).

Left alone on purpose: View Results, This Week, Grand Finale (full-season order), Pick 'Em (already active-only), roster cards.

## 3. Key Decisions & Lessons Learned

- `status === 'active'` on the checkbox list was necessary but not sufficient: a future episode saved with an explicit participant set (or a draft started before the vote-off) could still carry eliminated IDs. Intersect on open/save, and prune on publish.
- Empty `episode_participants` means "unrestricted at read time." For a published week that must mean "everyone still in as of that week," not "everyone still active today," or the eliminated couple vanishes from Correct Results.

## 4. Backlog & Deferred Items

Carried forward (untouched):

- Manual browser verification still owed for Season Clock + Grand Finale deadline caption.
- View Results / This Week "DND" / "—" display still needs a real published Did Not Dance couple.

Phone (~390px) visual pass on Admin → Schedule is for the coordinator (owner has a dedicated test login). Do not put credentials in the PR, commits, docs, or screenshots.

## 5. Next Steps

1. Coordinator: visual review at ~390px (click-path is in the PR). Do not merge from the agent.
2. Otherwise wait — nothing else is mid-flight.
