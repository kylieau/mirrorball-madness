# Session Handoff

## 1. Current State

**No feature in flight.** This session built and shipped two things for the live draft, both
pushed to `main` (`a7f1e9e`, `ed045aa`) with their SQL applied live and integration-tested:

1. **Draft safety** — membership freeze while `in_progress`; `update_scoring_categories`
   refuses turning Dance Card off mid-draft (other scoring edits stay allowed); commissioner
   `reset_draft` (full wipe, in progress *or* completed), `undo_last_pick` (any pick, replaces
   `undo_last_auto_pick`), `set_member_draft_autopilot`; lobby auto-saves draft order and
   reconciles joiners/leavers via realtime; advisory Realtime presence dots + a soft confirm at
   Start; pick confirmation dialog + "You drafted" banner; refetch on tab visibility /
   channel resubscribe / own pick.
2. **Draft queue** — private per-manager ranked list (`draft_queues`, `set_draft_queue`);
   `make_auto_draft_pick` takes the queue first, else random; `draft_picks.auto_source`
   (`queue`/`random`/null) drives the `auto · queue` / `auto · random` log label.

Also fixed a real bug: `start_draft` sized `roster_size` from *all* season couples while picks
require `status='active'`, so any draft started after an elimination could never finish. Now
counts active couples (16 couples / 14 active / 3 managers → 4 rounds).

All league drafts were reset live on 2026-09-21 (only "matt with the stars" had started; none
were real).

**The UI has not been click-tested in a browser** — only `tsc`/eslint/`npm test` (255 pass) and
the RPC scripts. The user plans to test on 2026-09-22 before real drafts.

## 2. Changes Made

`git diff --stat 98f44aa HEAD` (session start → now). **Ours:**
- `supabase/schema.sql`, **new** `supabase/apply-draft-safety.sql`,
  `apply-start-draft-active-couples.sql`, `apply-draft-queue.sql` (all applied live)
- `src/app/leagues/[id]/draft/actions.ts`, `page.tsx`
- `src/components/draft-room.tsx`; **new** `draft-managers-card.tsx`, `draft-queue-card.tsx`,
  `reset-draft-dialog.tsx`
- `src/lib/draft.ts`, `draft.test.ts`; **new** `src/lib/use-debounced-save.ts`
- `src/lib/supabase/types.ts` (**hand-edited**, see Backlog), `CLAUDE.md`, this file

**Not ours** (a parallel session's copy-picks work + a display tweak, already on `main`):
`src/app/leagues/[id]/page.tsx`, `predictions/actions.ts`, `all-results-view.tsx`,
`grand-finale-box.tsx`, `pick-em-box.tsx`, `other-leagues-picker.tsx`, `copy-picks.ts(+test)`,
`other-league-picks.ts`.

Uncommitted and not ours: `ios/App/App.xcodeproj/project.pbxproj`, `scratch/` (holds this
session's verification scripts: `test-draft-safety.mjs`, `test-draft-queue.mjs`,
`create-test-league.mjs`, `reset-all-drafts.mjs`, `check-leftovers.mjs`, etc.).

**Throwaway fixtures still live — delete after the user's UI test:** league "Draft Test
(throwaway)" (`d39b26a3-1076-48d0-b07e-2a143acf31f7`, invite `2KPRRJ`) and auth user
`draft-test-manager@example.test` (`9d7484e9-8199-4427-89db-56a72d6b9afe`). Delete the league
first (it cascades), then the user. The user's own account is a co-commissioner in it.

## 3. Key Decisions & Lessons Learned

- **`reset_draft` is a full wipe**: deletes `draft_picks`, `roster_slots`, `waiver_claims`,
  `weekly_manager_scores`; back to `not_started`. **Keeps** `draft_position`,
  `draft_autopilot`, predictions, scoring settings, queues, and the frozen
  `judges_score_starts_week` (a floor, so a redraft can't score already-aired weeks). Confirm
  is type-the-league-name. The user explicitly chose "wipe scores too" — don't add a
  scored-history block.
- **Membership freeze, not leave-handling**: join/leave/remove reject mid-draft ("Draft in
  progress — ask the commissioner to cancel it first"). A gap/null `draft_position` strands
  every pick and the pick math keys off member count.
- **Queues are private** (own table, owner-only RLS) because `league_members` is readable and
  realtime-broadcast league-wide. Queue is a wishlist: drafted/eliminated entries are skipped
  at pick time, not pruned server-side. Feeds autopilot/timeout only — no new draft mode.
- **Presence is advisory only** (never enforced server-side): dots + soft `window.confirm`
  at Start.
- **Realtime doesn't replay missed events** (phone sleep / signal loss) — hence the refetch on
  resume/resubscribe. Timeout auto-picks still need at least one connected browser.
- **Debounced-save state lives in `DraftRoom`, not the card** (`use-debounced-save.ts`): the
  lobby and in-progress views are separate returns, so a card holding its own state remounts
  and loses edits.
- **`record_draft_pick`'s last arg is now text `p_auto_source`** (was boolean `p_is_auto`);
  the old overload was dropped. Internal function, revoked from clients.
- **`update_scoring_categories` guard is narrow** (only Dance Card off mid-draft), so
  commissioners can still tune point values during a draft.
- **`create or replace` apply files are extracted from `schema.sql`** so the two can't drift;
  hand the user plain `.sql` files (no heredocs).
- **Live DB writes**: DDL still goes through the user (SQL Editor), but service-role REST
  writes work from `.mjs` scripts (used for the reset and test fixtures). RPCs that check
  `auth.uid()` need a signed-in throwaway user, not the service role.
- **Working style the user prefers here**: questions one at a time as clickable options with a
  recommendation; separate changes for separate concerns; rejecting `ExitPlanMode` means stop
  and wait for their next message; stage files by name (a parallel session shares this tree).
- **Don't `npm run build` while `next dev` listens on :3000.** Use `tsc --noEmit`, eslint,
  `npm test`.

## 4. Backlog & Deferred Items

- **Regenerate `src/lib/supabase/types.ts`** once a `SUPABASE_ACCESS_TOKEN` exists (currently
  hand-edited for `reset_draft`, `set_member_draft_autopilot`, `undo_last_pick`,
  `set_draft_queue`, `draft_queues`, `draft_picks.auto_source`, `record_draft_pick` args).
- **Confirm the deploy for `ed045aa` succeeded** on Vercel (past builds broke silently). The
  old deployed UI would call the dropped `undo_last_auto_pick`.
- **Auto-picks aren't announced** in the UI (dialog/banner cover manual picks only); no timer
  refetch for a silently stalled connection.
- **`league_members` DELETE realtime listener is unfiltered** (Supabase can't filter DELETEs),
  so other leagues' removals trigger a harmless extra refetch.
- **Site Admin visibility** (from an earlier session): the user wants some Site Admin pages
  moved to public view; scoped, deliberately not started.
- **Possible future ideas, not requested:** rewind-to-pick undo; a "ready check" beyond advisory
  presence.

## 5. Next Steps

1. The user click-tests the draft UI on 2026-09-22 with the throwaway league + account (two
   browsers). Start the new session with "read MEMORY_HANDOFF.md" and their findings; fix any
   UI bugs (likely spots: confirm dialog, queue `Select`, presence/Start warning, realtime
   member reconcile).
2. When they say they're done, delete the throwaway league and user (see §2).
3. Regenerate `types.ts` when a token is available.
