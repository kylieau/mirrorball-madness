# Session Handoff

_Last updated 2026-09-22 (co-manager feature, complete). Read this first, then `CLAUDE.md`._

## 1. Current State

**Co-manager feature is done and live-verified.** Both `supabase/apply-co-manager.sql` and the follow-up
`supabase/apply-co-manager-leave-order-fix.sql` have been run by the user against the live project.
`src/lib/supabase/types.ts` was regenerated for real (not hand-patched — the earlier hand-patch this session was
fully replaced once the SQL landed and a working `SUPABASE_ACCESS_TOKEN` was in place). `npx tsc --noEmit`,
`npm run lint`, `npm test` (308 passed), and `npm run build` all pass clean. `scratch/test-co-manager.mjs`
(real throwaway accounts via `admin.auth.admin.createUser()` + anon sign-in, cleaned up after) ran end-to-end
against the live database: **43/43 checks passed**, zero leftover test data.

## 2. Changes Made

Full design context: the approved plan from this session (co-manager mechanism) — read it for the "why" behind
every decision below before re-deriving them.

- **Schema** (`supabase/apply-co-manager.sql`, mirrored into `supabase/schema.sql`): one nullable
  `league_members.co_manager_id` (+ `co_manager_invite_code`) rather than restructuring the 7+ team-scoped tables —
  those keep storing the primary's `user_id` unchanged. New `resolve_acting_league_member(p_league_id)` helper
  resolves a co-manager's `auth.uid()` back to the primary id; swapped into `make_draft_pick`,
  `set_draft_autopilot`, `set_draft_queue`, `submit_prediction`, `submit_grand_finale_prediction`,
  `submit_waiver_claim`. `is_league_member`/`is_league_commissioner` and the `profiles`/`draft_queues`/
  `predictions`/`grand_finale_predictions` RLS policies updated to match either id. New RPCs:
  `generate_co_manager_invite_code`, `join_as_co_manager`, `remove_co_manager`.
- **Live-testing fix** (`supabase/apply-co-manager-leave-order-fix.sql`): `leave_league` originally checked
  `is_league_commissioner` before the co-manager check — since full parity means a co-manager of a commissioner's
  team passes `is_league_commissioner` too, they got the misleading "Commissioners can't leave their own league"
  instead of "Use \"Leave as co-manager\" instead". Reordered so the co-manager check runs first. Blocking
  behavior never changed, only the message — but this is exactly the kind of thing that only surfaces under real
  end-to-end testing, not unit tests of pure-logic helpers.
- **New shared helpers**: `src/lib/acting-manager.ts` (`findOwnMembership`/`isOwnMembership`),
  `src/lib/manager-display.ts` (`formatManagerName` → "Alex & Jamie").
- **New route**: `src/app/join/co-manager/[code]/page.tsx` + `joinAsCoManager` server action
  (`src/app/leagues/actions.ts`), mirroring the existing `/join/[code]` flow.
- **Settings UI**: `src/components/league-members-section.tsx` gained self-service "Invite a Co-Manager" /
  "Remove Co-Manager" controls (independent of the commissioner-only Promote/Demote/Remove); new actions
  `generateCoManagerInviteCode`/`removeCoManager` in `src/app/leagues/[id]/settings/actions.ts`.
  `CopyInviteLinkButton` generalized with a `basePath`/`label` prop instead of forked.
- **The "viewer identity vs. team identity" audit** (the largest part of this change): once a second FK to
  `profiles` exists, the shorthand `profiles(display_name)` embed becomes ambiguous — every `league_members`
  query needed `profiles!league_members_user_id_fkey(display_name)` +
  `co_manager:profiles!league_members_co_manager_id_fkey(display_name)`. Separately, every "is this me" check
  (`.eq("manager_id", userId)`, `x.user_id === currentUserId`) had to resolve through `findOwnMembership`/
  `isOwnMembership` first, or a co-manager sees wrong standings rank, zero leagues on Account Settings, stale
  picks-needed nagging, etc. Touched: `src/app/leagues/[id]/page.tsx`, `draft/page.tsx`, `settings/page.tsx`,
  `waivers/page.tsx`, `src/app/{today,this-week,notifications,leagues}/page.tsx`,
  `src/lib/{league-home-summary,league-summary,account-settings-data,other-league-picks}.ts`,
  `src/components/{draft-room,draft-managers-card,leave-league-button}.tsx`, `src/lib/draft.ts`
  (`partitionPresence` now checks the co-manager id too, for the presence dot).
- **`src/lib/draft.test.ts`** updated for `partitionPresence`'s new signature; added a co-manager-presence case.
- **`CLAUDE.md`** updated with a new Data Model Facts bullet documenting the whole mechanism.
- **`scratch/test-co-manager.mjs`** (kept, matches this repo's scratch/ convention of keeping past verification
  scripts around): covers invite/join guardrails, RLS visibility, commissioner-powers-via-co-manager, both
  leave/detach message paths (commissioner-primary and plain-manager-primary), full-parity draft actions (queue,
  autopilot, picks — including turn-order rejection in both directions), and Curtain Call + Grand Finale
  predictions landing under the primary's `manager_id`.

## 3. Key Decisions & Lessons Learned

- **Contained-by-design paid off**: keeping `co_manager_id` as a single nullable column (not a join table, not
  restructuring downstream tables) meant the live SQL fix needed after real testing was a one-function
  `create or replace`, not a data migration.
- **A hand-patched `types.ts` really is just a stand-in** (matches the prior session's lesson) — this session's
  hand-patch was accurate for what it covered, but was still fully thrown away and regenerated for real the moment
  a working token existed. Don't skip that step even when the hand-patch "looks done."
- **`SUPABASE_ACCESS_TOKEN` troubleshooting this session**: the value in `.env.local` was first found to be two
  tokens concatenated with no separator (88 chars, double the normal 44) — a `LegacyInvalidAccessTokenError`.
  After the user fixed the length, a second attempt hit `LegacyInvalidAccessTokenError`/`Unauthorized` on
  `supabase projects list` — the token itself was expired/revoked, not a format issue. The user generated a fresh
  one from supabase.com/dashboard/account/tokens and it worked. If this ever look format-valid but still gets
  Unauthorized, check `supabase projects list` first — it isolates "bad format" vs. "dead token" vs. "wrong
  project" in one call.
- **Live testing found a real bug unit tests couldn't**: the `leave_league` check-ordering issue (see above) only
  shows up when a co-manager is attached to an *actually-commissioner* team and both `is_league_commissioner`
  branches are live simultaneously — no pure-logic unit test exercises that interaction. Reinforces
  `CLAUDE.md`'s "exercise the actual feature path" rule literally, not just as "run the build."
- **Working style reminder** (held from the prior handoff, confirmed again this session): the user rejected
  `ExitPlanMode` twice before approving — once to ask clarifying questions one at a time, once to have the
  handoff re-read and verified against `git status` first. Both times the right move was to stop and do exactly
  what was asked. All "recommended" defaults offered via `AskUserQuestion` were accepted as-is.

## 4. Backlog & Deferred Items

- Nothing new deferred from this feature — it's complete. Carried over, untouched this session: Monte Carlo
  re-fit against real Season 35 data, a human click-through of the custom-draft lobby UI, the dead "not a member"
  branch in `set_custom_draft_order`, the Settings "✓ Settings saved" banner not clearing on edit, Site Admin page
  visibility.
- **Not yet human-clicked**: the co-manager invite/settings UI (`InviteCoManagerButton`/`RemoveCoManagerButton` in
  `league-members-section.tsx`, the `/join/co-manager/[code]` page) has only been exercised via RPC calls in the
  integration test, not through an actual browser — same caveat the custom-draft-order lobby UI still carries.

## 5. Next Steps

1. Ask the user what to work on next — no queued task. Good candidates from §4: the Monte Carlo re-fit, a human
   pass on the custom-draft lobby UI, or a human pass on the co-manager Settings UI (first-time click-through).
2. Working tree currently has: this session's co-manager changes (unstaged, not committed — user hasn't asked
   for a commit), plus the pre-existing `ios/App/App.xcodeproj/project.pbxproj` (not ours) and untracked
   `scratch/` (now including `test-co-manager.mjs`). Stage by name if/when asked to commit — never `git add -A`.
