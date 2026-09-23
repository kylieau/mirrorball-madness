# Show Settings taxonomy: round types + dance style categories

_Written 2026-09-23 for handoff between tool sessions (previous session was Claude Code,
ran out of usage before starting implementation). Not started — planned only. Read
`MEMORY_HANDOFF.md` first for the fuller picture of what's already shipped._

## Context

The dance style list currently conflates two different things: styles (what
was danced — waltz, jive, contemporary) and *round types* (the format a
style gets slotted into — Team Dance, Trio Dance, Instant Dance, Judges'
Choice, Redemption Dance, …). Round types are round-wide — on a team dance
night the whole cast does one — so storing it per couple, which is what
today's `episode_results.was_team_dance` does (identical `true` on every
couple that danced that night), is redundancy, not information. It belongs
on the episode, declared when the night is scheduled — same reasoning that
already moved Schedule to its own page (`/admin/schedule`) in a prior pass.

Because the round-type list grows season to season (this season's
"Redemption Dance," a future season's something else), round types are a
**managed table** like `dance_styles`, not a fixed enum — added in Show
Settings, no migration needed per addition. Dance styles separately gain a
**`category`** (`ballroom` / `latin` / `show`); that list *is* closed, so it
stays a check-constrained column, not its own table.

**Also folded in**: `episodes.expected_dance_count` ("Dances (Per Couple)")
moves from the Enter Results form (where it silently resets to 1 on every
episode switch — `results-form.tsx`'s own comment admits it "isn't part of
the draft tables") to Schedule, alongside round types and participants — all
three are properties of the night, known ahead of air. This was flagged in
an earlier plan and never done; doing it alongside round types since
Schedule's episode form is already being touched for the tick-list.

**Deliberately not built**: a per-dance `dance_scores.format` column (would
say *which* of a couple's dances was the team dance — today's UI only notes
it at the couple level anyway via `was_team_dance`, so episode-level loses
nothing current; additive later if it ever matters), and availability
windows for when a round type "unlocks" in a season (whoever schedules the
episode knows what that night is).

None of this touches the access tiers (view/propose/publish — see
`MEMORY_HANDOFF.md` and CLAUDE.md's "Results entry has three access tiers"
bullet) or the Results/Schedule/Show Settings page split from the already-
merged PR #30 — this plan builds *inside* that shape.

## Current shape (verified against code as of 2026-09-23, post-PR-#30-merge)

- `dance_styles` (`supabase/schema.sql:460`): `id`, `name`, `created_at`. No
  category. Managed today via `NamedItemsCard` in
  `src/components/judges-dance-styles-manager.tsx` — a flat add-only badge
  cloud, **no per-item action or extra field** (unlike `ScoringJudgesCard` in
  the same file, which renders real per-item rows with Edit/Archive). Adding
  a category selector per style needs a different rendering than
  `NamedItemsCard` provides.
- `was_team_dance` (`schema.sql:516` on `episode_results`, `:2298` on
  `draft_episode_results`) is threaded through: `src/lib/results.ts:29`
  (`EntrySubmission.wasTeamDance`) and `:596` (write); `src/lib/results-draft.ts`
  (`:19`, `:45` types, `:135`/`:181`/`:290`/`:396` read/write); `results-form.tsx`
  (`:97` field, `:108`/`:137`/`:348` plumbing, `:456` — see below);
  `all-results-view.tsx:45` (type) and `:143` (`noteLabel`'s per-couple "team
  dance" string); `results-page-data.ts:41` (type) and `:118` (select).
  (Line numbers approximate — re-grep before editing, this doc may drift.)
- **The bulk multi-couple entry mechanic (`addTeamDance` /
  `TeamDanceSheetContent`, "Score a Team Dance" button,
  `results-form.tsx:449`) is independent of the `wasTeamDance` flag** — it
  takes `coupleIds[]` and adds the same style/song/scores to each couple's
  row; the flag at line 456 is set purely for later display, not part of the
  bulk-add logic. Removing the flag doesn't touch this mechanic, and it stays
  useful for Trio Dance nights too (any grouped performance), just under its
  existing name — renaming it is a reasonable future cosmetic follow-up, out
  of scope here.
- `expected_dance_count` (`schema.sql:436`, comment: "informational only,
  doesn't gate how many dances a couple can actually submit") is currently
  owned by the results-entry flow: `results-form.tsx:243` local state reset
  to `1` on every episode switch (`:315`, with its own comment explaining why
  — "isn't part of the draft tables"), derived at publish from the actual max
  entered (`results-draft.ts:279`, `Math.max(1, ...)`) and written by
  `applyEpisodeResults` (`results.ts:498`). `ScheduleEpisodeInput`
  (`results.ts:149`) and `applyEpisodeSchedule` deliberately skip it
  (`results.ts:180` comment).
- `applyEpisodeSchedule` already has the exact template for a tick-list
  write: `participantCoupleIds` → delete-then-reinsert against
  `episode_participants` (`results.ts`, right after the episode
  update/insert). `episode_participants` itself (`schema.sql:2372`) is the
  schema template: composite PK, `on delete cascade`, `grant select ...
  using (true)`.
- `loadResultsPageData` (`src/lib/results-page-data.ts`) is the single shared
  loader for `/admin/results`, `/admin/schedule`, and (partially) `/admin/show-settings`
  since the Phase-1 UX merge — this is where round types, the
  episode→round-type map, and dance style categories get added once, not
  duplicated per page.
- **Gap found while re-grounding, not introduced by this plan**: every
  action in `src/app/admin/results/actions.ts` calls
  `revalidatePath("/admin/results")` only — never `/admin/schedule` or
  `/admin/show-settings`, even though `scheduleEpisode` writes data
  `/admin/schedule` displays, and the judge/dance-style actions write data
  `/admin/show-settings` displays. Harmless before the split (one page), a
  real staleness bug now (edit on `/admin/schedule`, its own data doesn't
  refresh without a manual navigation away and back). Fix the specific call
  sites this plan touches (see below) — don't need to fix every action, just
  the ones this plan is already editing.
- `Select` (Base UI) needs an explicit `items` prop or the closed trigger
  shows the raw value — exact pattern already used at `results-form.tsx:729`
  (`items={danceStyleItems}` + `SelectContent`/`SelectItem` children).

## Implementation

**Schema** (`supabase/schema.sql` + new `supabase/apply-round-types-and-style-categories.sql`
for the owner to run in the Supabase Dashboard SQL Editor — this container/
session has no live DB credentials, only the app code; kept as its own file,
not batched with anything else, so it verifies/rolls back independently):
- `dance_styles.category text` — check-constrained to `ballroom` / `latin` /
  `show`, nullable (new styles start uncategorized; categorize via the new
  per-row selector after adding, not at add-time).
- New `round_types` table, mirroring `dance_styles` exactly: `id uuid pk
  default gen_random_uuid()`, `name text not null unique`, `created_at`.
  Same grant/RLS as `dance_styles` (near `schema.sql:2327`): `grant select
  ... to authenticated`, policy `using (true)`. Seed 5 rows: Team Dance, Trio
  Dance, Instant Dance, Judges' Choice, Redemption Dance.
- New `episode_round_types` junction, mirroring `episode_participants`
  exactly: `episode_id uuid not null references episodes(id) on delete
  cascade`, `round_type_id uuid not null references round_types(id)`,
  `created_at`, `primary key (episode_id, round_type_id)`. Same grant/RLS,
  same index-on-episode-id pattern.
- Migrate `was_team_dance`: for every `episode_id` with any
  `episode_results.was_team_dance = true` row, insert one
  `episode_round_types` row pointing at Team Dance. Then `alter table
  episode_results drop column was_team_dance;` and `alter table
  draft_episode_results drop column was_team_dance;` (draft side needs no
  data migration — drafts are transient, deleted at publish).
- Update the `expected_dance_count` column comment (schema.sql:436) — it's
  no longer "informational only," Schedule now owns and writes it.
- Regenerate `src/lib/supabase/types.ts` afterward (documented in
  `CLAUDE.md` — `npx supabase gen types...`, needs `SUPABASE_ACCESS_TOKEN`).

**`src/lib/results-page-data.ts`** — extend `loadResultsPageData`:
- Add `roundTypes: { id: string; name: string }[]` (plain select, ordered by
  name) and `roundTypesByEpisode: Record<string, string[]>` (episode id →
  round type *names*, resolved server-side via a join so display components
  never need the id-level table) to the returned shape and the `Promise.all`.
- Add `category: string | null` to the `dance_styles` select — comes from
  the renamed taxonomy loader below.
- Add `expected_dance_count` to the `episodes` select list and its returned
  type — needed by `results-form.tsx` to read the scheduled value instead of
  resetting to 1, and by `schedule-manager.tsx`'s edit form.
- Drop `was_team_dance` from the `episode_results` select and returned type.

**`src/app/admin/results/actions.ts`**:
- New `addRoundType(name: string)` — mirrors `addDanceStyle` exactly
  (trim/validate, insert into `round_types`, `requireAdminAccess`). No
  rename action — dance styles don't have one either (`NamedItemsCard` is
  add-only), so round types match that same precedent rather than inventing
  a capability nothing else in this UI has.
- New `setDanceStyleCategory(styleId: string, category: "ballroom" | "latin" | "show" | null)`
  — `requireAdminAccess`, validates category against the three values,
  updates `dance_styles`.
- `scheduleEpisode`: also `revalidatePath("/admin/schedule")`.
- `updateSeasonSettings`: also `revalidatePath("/admin/schedule")` (season
  dates render there).
- `addJudge` / `archiveJudge` / `restoreJudge` / `renameJudge` /
  `addDanceStyle` / the two new taxonomy actions: also
  `revalidatePath("/admin/show-settings")`.
- `publishEpisodeResults`: also `revalidatePath("/admin/schedule")` (the
  Schedule episode list shows each row's published/draft status badge).
- `scheduleEpisode`'s `ScheduleEpisodeInput` (`results.ts:149`) gains
  `roundTypeIds: string[]` and `expectedDanceCount: number`.

**`src/lib/results.ts`**:
- `ScheduleEpisodeInput` gains `roundTypeIds: string[]` and
  `expectedDanceCount: number`.
- `applyEpisodeSchedule`: write `expected_dance_count: input.expectedDanceCount`
  into the episode fields object (the comment saying it's left untouched
  changes with it). Add a round-types delete-then-reinsert block against
  `episode_round_types`, identical shape to the existing
  `episode_participants` block just below it in the same function.
- `EntrySubmission` (`:29`) drops `wasTeamDance`. `applyEpisodeResults`
  (`:498`) stops writing `expected_dance_count` at all — Schedule owns it now,
  publish must not clobber it — and its write at `:596` drops
  `was_team_dance`.
- Rename `loadJudgesAndDanceStyles` → `loadResultsTaxonomy` and extend it to
  also select/return `roundTypes: { id: string; name: string }[]` and
  `category` on each dance style — it stays the single lightweight loader for
  "the three small managed lists," used as-is by `/admin/show-settings`
  (which needs nothing else) and by `loadResultsPageData` (which additionally
  needs the episode→round-type join, computed there since only it has the
  episodes list in scope already).

**`src/lib/results-draft.ts`**:
- `DraftEntryInput`/`DraftEntryState` drop `wasTeamDance`; every read/write
  site (`:135`, `:181`, `:290`, `:396`) drops the field.
- `publishEpisodeDraft`: remove the `expectedDanceCount` derivation (`:279`,
  `Math.max(1, ...)`) and stop passing it (`:298`) — `applyEpisodeResults`
  no longer accepts it.

**`src/components/results-form.tsx`**:
- Drop `wasTeamDance` from local entry state and all plumbing (`:97`, `:108`,
  `:137`, `:348`); **keep** `addTeamDance`/`TeamDanceSheetContent` exactly as
  they are (`:449` loses only the `wasTeamDance: true` line — the
  multi-couple bulk-add itself is untouched).
- Drop the "Dances (Per Couple)" `Input` and its `expectedDanceCount` local
  state (`:243`); read `selectedEpisode.expected_dance_count ?? 1` directly
  instead, recomputed whenever `selectedEpisode` changes (replacing the
  `setExpectedDanceCount(1)` reset at `:315` — same effect dependency array,
  just reading the episode's own field instead of hardcoding). Stays a soft
  scaffolding cap (`canAddDance`, `TeamDanceSheetContent`'s `availableCouples`
  filter) — the finale won't be uniform across couples, so this was never
  meant to be a hard limit and still isn't.

**`src/components/schedule-manager.tsx`** — the episode add/edit sheet gains:
- `expectedDanceCount` state (mirrors `episodeNumber`'s shape: plain number,
  default `1`), set from `e.expected_dance_count` in `openEditEpisode`, reset
  to `1` in `resetForm`, sent in `handleSave`'s `scheduleEpisode` call. New
  `Input type="number"` field in the same "Episode Details"-equivalent area,
  moved verbatim (copy, not two independent inputs) from `results-form.tsx`.
- `roundTypeIds: Set<string>` state, mirroring `participantCoupleIds`
  exactly: `toggleRoundType` function, set from `roundTypesByEpisode[e.id]`
  (names) resolved back to ids via the new `roundTypes` prop in
  `openEditEpisode`, reset to empty `Set` in `resetForm`, sent as
  `roundTypeIds: [...roundTypeIds]` in `handleSave`. New tick-list UI in the
  sheet (checkbox row per `roundTypes` entry — same visual pattern as the
  participant tick-list already in this component).
- New props: `roundTypes: { id: string; name: string }[]`,
  `roundTypesByEpisode: Record<string, string[]>` (names, for read-only
  display) — both come from `loadResultsPageData`.
- The read-only `EpisodeRow` display gains the episode's round types as
  small badges (reuses `Badge`, already imported) when
  `roundTypesByEpisode[e.id]` is non-empty — visible to every viewer, not
  just admins (Schedule's view tier already shows everything else).

**`src/components/judges-dance-styles-manager.tsx`**:
- New `RoundTypesCard`: identical shape to the existing `NamedItemsCard`
  usage for Dance Styles (add-only badge cloud), just pointed at `roundTypes`
  / `addRoundType`. Reuses `NamedItemsCard` directly — no new component
  needed, it already takes `items`/`placeholder`/`addLabel`/`onAdd` generically.
- **New `DanceStylesCard`** replacing the current `NamedItemsCard` usage for
  dance styles: real per-item rows (same shape as `ScoringJudgesCard`'s list,
  not a badge cloud), each with a `Select` for category
  (`items={{ballroom: "Ballroom", latin: "Latin", show: "Show"}}`, matching
  the `results-form.tsx:729` pattern) calling `setDanceStyleCategory` on
  change. Keeps the existing add-input+button at the bottom (still just a
  name — category is set after adding, via the row's own selector, not at
  add-time).
- `JudgesDanceStylesManager`'s props gain `roundTypes`.

**`src/app/admin/show-settings/page.tsx`**: swap its `loadJudgesAndDanceStyles`
call for `loadResultsTaxonomy`, pass `roundTypes` through to
`JudgesDanceStylesManager`. Stays lightweight — doesn't call the full
`loadResultsPageData` (episodes/scores/drafts/etc.), which this page has
never needed and still doesn't.

**`src/components/all-results-view.tsx`**: `noteLabel` (`:143`) drops the
`was_team_dance` check (its `EpisodeResult` type at `:45` drops the field).
The removed per-couple "team dance" note is replaced by an **episode-level**
round-type badge — same treatment as `schedule-manager.tsx`'s `EpisodeRow`
above, rendered once per episode (wherever this component already renders
per-episode chrome in its By-Week accordion), not per couple. Needs
`roundTypesByEpisode` threaded in as a new prop from `results-screen.tsx`.

**`src/components/results-screen.tsx`**: thread `roundTypes` /
`roundTypesByEpisode` from the page down into `AllResultsView`.

**`src/app/admin/results/page.tsx`**: no structural change — already calls
`loadResultsPageData`, which now returns the extra fields; just pass them
through to `ResultsScreen`.

**Docs**: `CLAUDE.md`'s data-model section gets a bullet — styles vs round
types, why round types are episode-level (round-wide, so per-couple storage
was redundant), the note that a per-dance format column and availability
windows were deliberately deferred, and that `expected_dance_count` moved to
Schedule.

## Verification

- `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` — **not**
  while `next dev` is running if one happens to be up (running a production
  build while a dev server is live clobbers its `.next` directory and breaks
  it — check `ps aux | grep "next dev"` first).
- After the owner runs the migration SQL: verify with the service-role key
  that `round_types` is seeded (5 rows), `episode_round_types` carries a Team
  Dance row for each episode that previously had `was_team_dance = true`,
  and both `was_team_dance` columns are gone.
- Live click-through: add a round type in Show Settings, tick it on an
  episode in Schedule, confirm the badge shows on both Schedule's own row
  and on View Results (By Week); set a category on a few dance styles and
  confirm it persists across a reload; set Dances (Per Couple) on a
  scheduled episode, enter and publish results with a different number of
  dances for one couple than scheduled, and confirm the scheduled value
  survives publish rather than being overwritten back to the entered max.
  Also confirm editing on `/admin/schedule` and `/admin/show-settings` now
  reflects immediately without a manual navigate-away-and-back (the
  revalidatePath fix).
- No live Supabase credentials exist in a typical dev container for this
  project — schema changes get written to a `.sql` file and handed to the
  project owner to run via the Supabase Dashboard SQL Editor, then verified
  afterward with the service-role key. See `CLAUDE.md`'s "Environment
  Gotchas" section.
- This should land as its own new branch + PR against `main` (the previous
  feature, PR #30, is already merged — nothing to build on top of there).
  If working without the `gh` CLI (not installed in the Claude Code
  devcontainer used previously — may or may not apply to whatever
  environment picks this up), PR creation/status-checking can go through the
  GitHub REST API directly via `curl`, authenticating with a token from
  `git credential fill` (works in VS Code-based devcontainers) as the bearer
  token. Ask the project owner whether this PR should also start as a draft
  awaiting her "Push Pilot" (a Grok-based phone-preview review bot on
  Vercel) before merging, matching PR #30's pattern.
