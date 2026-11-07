# Dance Card v2 — build and rollout plan

Approved in principle by Kylie, 2026-11-07, subject to adversarial review by
the advisor and Codex: apply to Season 35; k = 0.8884 for two-couple rosters
(k_N by roster size); p = 0.80; Fantasy Bonus inside S; each night keeps
paying its own night; each league's commissioner agrees and its members are
told before it switches; no league switches before E10 (Week 9) is published.

Revision 3 folds in two rounds of both reviews (2026-11-07): atomic cascade
inside publication, full-week recompute on reveal and draft night, one
ledger in integer cents, a dedicated snapshot with its own revision, exact
coverage on every switch, plan version 4 required wherever a v2 league is
scored, the recompute path adapted, an Anchor Week guard, no switch
mid-night, rollback by recompute only, and the new-league default moved after
the deploy.

The rule itself is `frozen-rule.json`.

## 1. The rule in code

`src/lib/dance-card-v2.ts` (pure, no DB) is the only place S and V are
computed.

- `DanceCardRule = { version: "v1" } | { version: "v2"; exponent: 0.8; coefficient: number }`.
- `DANCE_CARD_V2_COEFFICIENTS` by roster size (1.7309, 0.8884, 0.6117,
  0.4589, 0.3217, 0.3061), pinned by a test against a v2 branch of the solver
  in `strong-play-ceilings.ts`. The version string pins the exponent and the
  table; a refit is a new version, never an edit to v2.
- `danceCardRule(settings, rosterSize)`: v1 unless
  `scoring_settings.dance_card_version = 'v2'`. `leagues.roster_size` is
  fixed once start_draft derives it.
- `weekInput` = `nightScaledScoresByCouple` over the week's rows (nights in a
  fixed order) plus the week's settled `episode_results.bonus_points`.
- `danceCardLedger(weeks, anchorWeek, rule)` sums inputs in ascending week
  order and returns, per couple per week, `{ input, cumulative, valueCents,
  creditCents }` with `valueCents = Math.round(k × S^p × 100)` (0 for S ≤ 0)
  and `creditCents` the integer difference. Integer cents make the credits
  telescope exactly. Weeks before the Anchor Week add nothing.

A couple's S is global from the Anchor Week. Each week's credit goes to
whoever holds the couple that week (`roster_slots`), so a Recast pickup earns
only later credits.

## 2. The engine

- `computeWeeklyScores` gains an optional `danceCardCreditByCouple`. When
  present, a rostered couple pays its credit and nothing else in Dance Card
  (no survival, placement or flat bonus). Absent, the v1 path is untouched.
- `buildWeeklyScoreRows` gains `history` (every live dance row and settled
  outcome of the season, with week numbers). For a v2 league it builds the
  ledger through week t and passes week t's credits in. The publication
  snapshot already carries every season dance and outcome. A v2 league with
  no `history` passed is an error, never silently scored without priors.
- **`recomputeWeekScores`** (`results.ts`, called only by
  `scripts/recompute-published-weeks.ts`) passes the snapshot's history too,
  and is parity-tested against the publication plan.
- **Reveal** (`episode-reveal.ts`): for a v2 league, `roster_points` is the
  week's full credit from everything live that week (posted dances, posted
  special dances, settled bonuses of published sibling nights), with the
  stored prediction and Grand Finale points kept. The linear
  stored + after − before shortcut stays for v1 only.
- **Order guard.** Reveal and undo refuse when any v2 league already has
  stored rows for a later week ("Week N already has scores. Publish weeks in
  order."), in the TypeScript plan and again in `commit_episode_reveal` /
  `commit_team_reveal`. Out-of-order entry doesn't happen in practice;
  refusing keeps later weeks from going stale.
- **Plan version 4** is required by publication and both reveals whenever any
  v2 league is scored, so an old app instance can never write v1 arithmetic
  for a v2 league. The existing `< 2` (points dances) and `< 3`
  (couple-by-couple heats) checks stay; 4 satisfies both.

## 3. Atomic cascade on publication

Under v2 a correction to week t changes every later week, so publication
installs both in one transaction.

- `episode_publication_snapshot` gains `laterWeeklyScores`: every stored
  `weekly_manager_scores` row for an active-season week numbered after this
  episode's week. The revision already hashes the whole payload.
- `buildPublicationPlan` adds `laterDanceCard`: for each v2 league with
  later rows, every later row's new `roster_points` and `total_points`
  (stored prediction and Grand Finale points recombined as
  `computeWeeklyScores` does). `PLAN_VERSION` becomes 4.
- `commit_episode_publication_with_later_weeks` calls the unchanged live
  `commit_episode_publication` and then `apply_later_dance_card`, in the
  caller's one transaction (built this way rather than by copying the long
  live body; just as atomic). `apply_later_dance_card` checks the rows after
  the week is installed: each row must exist, belong to a v2 league and a later week of the
  active season, and the set must cover every stored later row of every v2
  league exactly, with unique keys and finite cent amounts; each total must
  equal `round(roster × w_judges + prediction × w_elim + grand_finale × w_bonus, 2)`
  from the stored prediction and Grand Finale points and current weights,
  within a cent. Only `roster_points` and `total_points` change. It refuses a
  plan below version 4 whenever a v2 league is scored.
- The version-4 gate and the reveal order guard live in
  `assert_special_dance_plan`, which publication and both reveal commits
  already call, so none of the three live bodies is copied. A publication
  plan always carries `laterDanceCard` (possibly empty) and a reveal plan
  never does; that is how the guard tells a reveal apart.

## 4. Database (`supabase/apply-dance-card-v2.sql`)

Like the other recent migrations it is not mirrored into `schema.sql`; the
DB tests stack it on the live chain.

1. `scoring_settings.dance_card_version text not null default 'v1'`, check
   `('v1','v2')`. Commissioner RPCs never write it.
2. A trigger on `scoring_settings` refuses a change to
   `judges_score_starts_week` on a v2 league that already has stored rows,
   because under v2 the Anchor Week changes every week's S. League Settings
   hides Update Anchor for those leagues.
3. `weekly_manager_scores_archive` (migration_id, archived_at, league_id,
   manager_id, week_id, the four point columns, dance_card_version). RLS on,
   no grants to anon or authenticated.
4. `dance_card_snapshot()`: the active season, its weeks, episodes, couples,
   dances, outcomes, every league, scoring_settings and roster_slots, and the
   season's `weekly_manager_scores`, ordered `jsonb_agg`, plus `_revision` =
   md5 of that payload.
5. `set_dance_card_points(p_actor_id, p_league_id, p_revision, p_version,
   p_migration_id, p_rows)`. In one transaction:
   - lock the same tables in the same order as `commit_episode_publication`,
     with `lock_timeout`;
   - require a super-admin actor and a revision equal to a fresh
     `dance_card_snapshot()`;
   - require unique keys and rows covering exactly every stored row of that
     league in the active season;
   - archive the league's rows under a new migration id (refuse a reused one)
     when switching version;
   - update only `roster_points` and `total_points`, checking each total
     against `round(roster × w_judges + prediction × w_elim + grand_finale × w_bonus, 2)`
     within a cent;
   - refuse a version switch while any active-season episode has live
     `dance_scores` but no `results_published_at` (never switch mid-night;
     switches run between a publish and the next curtain);
   - set the version. A refresh (`p_version` null) requires the league to
     already be v2.

All functions: `security invoker`, `set search_path = ''`, schema-qualified,
`revoke all … from public, anon, authenticated`, `grant execute … to
service_role`. Rehearsed in `src/lib/dance-card-v2-db.test.ts` (PGlite, on
the live chain of SQL files): revision refusal, coverage refusal, reused
migration id, foreign-league rows, CC/GF untouched, version flip and back,
the mid-night switch refusal, cascade on a correction, an injected cascade
failure rolling back dances, outcomes, this week's and later scores,
publication metadata and draft cleanup, the version-4 refusal on all three
commits, an old version-3 plan committing exactly as today while every league
is v1, the order guard, and the Anchor Week trigger. The chain mirrors live:
`schema.sql`, the applied `apply-*.sql` files through `apply-episode-rounds.sql`
and `apply-special-dance-label.sql`, then the new file. Production's snapshot
keys were checked read-only (2026-11-07) and match `apply-episode-rounds.sql`,
including `teamCoupleMarks`.

`supabase/apply-dance-card-v2-default.sql` (one statement, applied only after
the app is deployed) sets the column default to `'v2'`, so leagues created
afterwards start on v2. Applying it earlier would let the old app score a
"v2" league with v1.

## 5. Switching on, verifying, switching off

`scripts/dance-card-v2.ts` (run from the project root, `--actor <profile id>`
of a site admin):

- `--dry-run`: per league, the per-couple ledger, per-week manager rows,
  totals and ranks before and after. Two gates stop it: a v1 rebuild must
  equal every stored `roster_points` row to the cent, and Curtain Call and
  Grand Finale must not change on any row.
- `--apply --league <id>`: compute v2 from the snapshot, call
  `set_dance_card_points` with a new migration id and `'v2'`.
- `--verify`: every v2 league's stored rows equal a v2 rebuild from live data.
  Run after every switch and after any correction publish.
- `--rollback --league <id>`: recomputes v1 from live data and switches back.
  The v1 rebuild is exact (the dry-run gate proves it), so there is no
  restore-from-archive path; the archive is the audit record of what was
  replaced.
- `--refresh --league <id>`: recompute an already-v2 league in place.

## 6. Readers

Each reads its league's rule; v1 stays as it is. All go through
`danceCardLedger`.

| Reader | Under v2 |
|---|---|
| Draft-night standings (`draft-scores.ts`, `league-page-data.ts`, `league-home-summary.ts`) | the week's full credit from visible inputs (live rows, released drafts, settled sibling bonuses) over priors from a new per-request `loadDanceCardHistory`; the stored row's prediction and Grand Finale points kept. Draft unlock marks the week watched, so earlier weeks are always within the viewer's cutoff. |
| Couples Leaderboard and In Your Leagues | judges points = sum of held-week credits; bonus column 0; undrafted what-if from the Anchor Week |
| Roster lines on Picks / Standings (`roster-couple-points.ts`) | week = credit, total = sum of credits; Picks loads settled bonuses for every visible week from the Anchor Week, S built globally before ownership |
| Roster card Survival & Bonuses row | not rendered for v2 (nothing sits outside the credits) |
| Score History | one line per couple-week, points = credit, label shown to Kylie before shipping (draft: `Harry: Jdg 30 · Season 177.75`); no survival, podium or bonus lines |
| League Settings | read-only Dance Card scoring line in place of the multiplier, survival and placement fields; saves keep sending the stored values |
| Finish Week Fantasy Bonus (pts) | help text says it joins the show score in v2 leagues; copy for Kylie |

Weighted display lines round `creditCents × weight` per line; manager totals
keep coming from stored rows, so a weighted line sum can differ from the total
by a cent per line, as it can today.

Two readers change without code because they recompute from stored rows:
Home Recent Activity's "overtook" lines and Standings' rank arrows. After a
switch, past overtakes and arrows rewrite themselves. Both are in the browser
check and belong in the note to members.

## 7. Tests

Vitest, pure (parity is exact in unweighted cents; weighted lines within a
cent each): handoff §10 properties (monotonic, equal histories, telescoping
cents, no survival or placement, early exits, doubles, team rows counted
once, roster factor, module isolation, idempotent reruns); points rows and
the immunity row; a two-night week with a settled night-1 bonus revealed
night by night; a correction cascading; reveal then undo returning to the
same cents; the order guard; v1 and v2 leagues in one publish; Score History
and the Couples Leaderboard summing to stored v2 rows; v2 plan rows equal to
a rebuild from live after commit. Every existing v1 test passes unchanged.

## 8. Rollout

1. Build on branch `dance-card-v2`. Nothing merges or deploys before E10.
2. After E10 is published, `--dry-run` against production; review the numbers
   with Kylie, Week 9 included.
3. Kylie gets each commissioner's agreement and tells members.
4. Kylie applies `apply-dance-card-v2.sql`; verify with the service role;
   regenerate types; merge and deploy. Every league is still v1.
5. Kylie applies `apply-dance-card-v2-default.sql`.
6. `--apply` each consenting league, then `--verify`; check Standings, Score
   History, Home, Picks and the Couples Leaderboard in a browser with
   throwaway accounts.
7. Update CLAUDE.md, BACKLOG and the handoff.

## 9. Risks

- **The commit function is the live publish path.** It is extended from its
  exact live body, rehearsed in PGlite, and with every league on v1 the new
  block is a no-op.
- **Readers drifting from the engine.** One ledger, and parity tests tie the
  readers to stored rows.
- **Front-loaded weekly lines** will draw questions; member copy is Kylie's.
- **The Anchor Week trigger also freezes the Curtain Call and Grand Finale
  start** in v2 leagues once scored, since one Anchor Week gates every module.
