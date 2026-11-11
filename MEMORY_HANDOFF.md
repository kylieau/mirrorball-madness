# Session Handoff — 2026-11-11 PT (Roster Moves switch built, awaiting review and Kylie's push; one more run of the podium SQL)

## 1. Current State

**In focus now: the Roster Moves card and pages, built and uncommitted.** Kylie picked card C1 (the same Lifeline | Recast | Trades switch on the Picks card and on the three pages, a gold dot where something needs her, the selected move's lines and an Open link) over the mock in `docs/design/roster-moves-pages/`. tsc, eslint, 1021 tests and `next build` pass; a scratch league (torn down) verified the card, the three pages, the Claim sheet, a Lifeline save, the trade picker and an accept at 390/360. Not verified: saving a waiver claim from the sheet (the scratch run was already due, see `BACKLOG.md`). `CLAUDE.md` describes it. Codex review was running at handoff; the push needs her yes.

**In focus: Kylie's Nov 11 build, committed and pushed to `main` on Nov 11 with her yes.** She applied `supabase/apply-curtain-call-podium.sql` first; a read-only check found the columns and both RPCs, and regenerated types match the committed file. No live league data was touched.

- **Curtain Call's Finale podium** (she chose a podium with distance credit): Week 11's elimination pick is Winner, Runner-Up and Third Place, each paying that week's elimination payout (3.23 at defaults), half for one place off, nothing for two (`PODIUM_PLACE_OFF_FRACTION = 0.5`; the first mock had thirds, and she approved the proposal after I said I'd go with half), always on; top scorer unchanged. `supabase/apply-curtain-call-podium.sql` is applied live and rehearsed (`curtain-call-podium-db.test.ts`). **It needs one more run:** after her apply, the Codex review found `submit_podium_prediction` didn't check that picked couples are in the week's season; the check is now in the file and `schema.sql` (safe to run again; the app doesn't depend on it).
- **Own dances first** wherever a night's dances are listed (`orderNightDances`).
- **Dance Card weight line** on Picks' roster card when the weight isn't 1.
- **Home league card roster moves** under Dance Card (`rosterMoveRows`, `loadHomeRosterMoves`); a missing Lifeline counts as Picks Due. Looked at in a browser with made-up data only (a temporary page, deleted); the scratch league has none of the three mechanisms on.
- **Equalizer in Score History** stays one lump (her "ok thanks"); nothing built.

Checks before the push: `npx tsc --noEmit` and `npx eslint src scripts` clean, `npm test` and `rm -rf .next && npm run build` pass. Live browser check with the scratch league (seeded and removed): Home, Results (own dance first, dance-off under it), Picks, Standings and Manage Leagues render; the regular Week 10 pick saves. Codex review: nothing blocking, the one season-check gap above. Not exercised live: the podium form and recap (Week 11 picks open only after Week 10's results; Week 10 airs Nov 17) and the Home card's move lines.

**Earlier this session, pushed: Finale fairness.**

**Finale fairness (Kylie, Nov 11: "the week rule quirk should not exist", then "agree with your fixes").** On `main` at `1974e2f`, on top of `e2b34a6` (a test pinning Grand Finale distance to the week ticked Finale). Both were pushed with this handoff sync; this session did not confirm the Vercel deploy. No SQL, no live data touched, and no week before the Finale changes, so nothing needs a recompute.

- **Grand Finale distance:** the Finale is one week split evenly between its places (`SlotWeeks.finaleSpots`; `grandFinaleDistance` returns `weeks` for the penalty and keeps `off` / `unit` for Score History's `Off 1 place`). With five finalists a place costs a fifth of a week. A winner pick at 8.33 / 2.08 pays 7.91 for 2nd, 7.50 for 3rd, 7.08 for 4th or 5th, and 6.25 for a Semi-Finals exit (before: 6.25, 4.17, 2.09, 6.25, so 5th in the Finale paid less than going home the week before). League Settings' explainer says so.
- **Dance Card v3 survival:** every finalist gets the Finale's survival step (0.49 before the Dance Card weight), the couples entered as Eliminated on Finale night included; a withdrawal or bye gets none (`survivingCoupleIds` in `src/lib/dance-card-v2.ts`: a week that names a winner is the Finale; Lifeline's `survived` uses it too). v1 is untouched (it pays 4th and 5th placement points). The v3 rates stay as solved; the amendment is in `docs/design/dance-card-v3/README.md`. This changes the rule the commissioners agreed to, so Kylie may want to tell them before the Finale.
- **Still true:** 4th and 5th are both entered as Eliminated in the Finale week and share spots, so no module can tell them apart.

Checks on `1974e2f`: `npx tsc --noEmit` and `npx eslint src scripts` clean, `npm test` 100 files / 998 tests, `rm -rf .next && npm run build` succeeds. Not looked at in a browser (the only visible change is the explainer sentence).

**Live state (S35, as last read on Nov 11):**
- E10 (Week 9) is published; `scripts/dance-card-v2.ts --verify` matched on all four leagues afterward. 6 of 16 couples are still in. Week 10 (E11, Semi-Finals) airs Tue Nov 17; Week 11 (E12) is the Finale, Tue Nov 24.
- All four S35 leagues: Dance Card v3, Grand Finale `distance_based`, 8.33 per correct, 2.08 lost per week off.
- Grand Finale distance counts weeks (`8fda8c1`, `86dcd0e`): Weeks 1–9 were recomputed live on Nov 11 (33 of 200 rows, Weeks 7–9, only Grand Finale points; replaced rows are in `weekly_manager_scores_archive`; `--verify` matched).
- Lifeline was reset at Kylie's request after E10 ("too last minute to be fair"): every pick, payout and Equalizer row deleted and Lifeline off in every league. A commissioner can turn it back on in League Settings (it starts at the next open week with a fresh Equalizer offer).
- Recast and Trades are on in the three West-lock leagues and off in the two East-lock ones. `apply-recast-after-results.sql` and `apply-immune-heat-guard.sql` are applied live and verified.

**Hard dates (PT):**
- Thu Nov 12, about 10 PM: first waiver run (Week 9), 48 hours after E10's results were posted. Adds and trades start scoring in the Semi-Finals.
- Tue Nov 17, 5 PM / 8 PM by league: Semi-Finals lock, which is also the trade deadline. Curtain Call's Finale change should be decided and live by then.
- About Thu Nov 19 (48 hours after E11's results): last waiver run; adds and trades start in the Finale.
- Tue Nov 24: the Finale.

## 2. Changes Made

**The Nov 11 build, committed and pushed:** `supabase/apply-curtain-call-podium.sql`, `supabase/schema.sql`, `src/lib/supabase/types.ts` (matches a regenerate from the live project), `src/lib/curtain-call-podium-db.test.ts`, `src/lib/home-roster-moves-data.ts`, `src/components/league-triage-card.tsx`, `docs/design/curtain-call-finale-podium/`, `docs/design/home-card-roster-moves/`, `scripts/qa-screenshots/seed.mjs`, `CLAUDE.md`, `BACKLOG.md`, this file, and every other modified file under `src/` in `git status`.

Committed and pushed earlier:

- `1974e2f` Finale fairness: `src/lib/scoring.ts`, `dance-card-v2.ts`, `lifeline.ts`, `grand-finale-explainer.ts` and their tests, a comment in `strong-play-ceilings.ts`, `docs/design/dance-card-v3/README.md`, `CLAUDE.md`.
- `e2b34a6` `src/lib/weekly-score-rows.test.ts` pins the Finale tick; docs record the recompute.
- Earlier this session, already pushed and deployed: Grand Finale weeks (`8fda8c1`, `86dcd0e`), waiver run 48 hours after results and special rows named on Scores (`d524444`), immunity isn't a dance (`d6a1efc`), dance-off entry by picking the winner (`a7af587`), Roster Moves icons (`f9eae3d`) and card (`de21ca3`). `CLAUDE.md` describes each.

**Not ours; uncommitted, leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`, `.codex-private/`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

Settled by Kylie this session (details in `CLAUDE.md`):
- Grand Finale distance counts weeks, not spots, applied retroactively; the Finale is one week split between its places. The Finale tick on Schedule fixes the week count.
- Under v3 every finalist survives the Finale; v1 keeps its own rule; the v3 rates stay frozen for Season 35.
- The waiver run is 48 hours after a week's results are posted and never runs without results.
- Lifeline pays half the couple's credit whatever its outcome, and the Equalizer follows.
- Lifeline, Recast and Trades open from their own Roster Moves card on Picks (not the top bar, not the roster card). She picked the hourglass icons and passed on the bolder recap directions as too dramatic.
- Immunity is a bonus, not a dance; a Winner's Bonus heat is entered by picking its winner.
- She saw the Roster Moves / Lifeline review leftovers and said "i think we are good": don't start any of them without her say-so (list in `BACKLOG.md`).
- Trades: not building a trade-offer row on Picks or a combined Transactions page until she has used the build.

Rules that still hold:
- A push to `main` needs Kylie's yes in that turn. Commit only when asked. Stage by name, never `git add -A`.
- No live SQL apply by the agent; Kylie applies SQL. Live DB writes need her yes. League data backups go in the scratchpad only.
- The repo is public: never commit league standings or member names. No secrets in code.
- For a UI placement change: a mock or screenshot first, then Codex and UX/UI review before the push.
- Don't run prettier. Never `pkill -f`. `rm -rf .next` before `npm run dev` after a build; never build while the dev server runs.
- In-app Recast copy says "waiver". No turning Recast, Trades or Lifeline on in a live league for her.
- The advisor tool can't run on `claude-fable-5-2`.

## 4. Backlog & Next Steps

1. Finish the Roster Moves review (Codex findings, UX pass), commit by name (the `src` files in `git status`, `CLAUDE.md`, `BACKLOG.md`, `MEMORY_HANDOFF.md`, `docs/design/roster-moves-pages/`) and push with Kylie's yes. Kylie still runs `supabase/apply-curtain-call-podium.sql` once more (the season check). When Week 11 picks open, look at the live podium form.
2. Confirm the Vercel deploy of `1974e2f`, and Kylie decides whether to tell the v3 commissioners about the Finale survival amendment.
3. After the Thu Nov 12 waiver run: read-only check that it ran for the three leagues (`recast_cycles`, nothing in `recast_runs_overdue`).
4. After E11 is published: `--verify` (command below).
5. Done: `supabase/apply-dance-card-v3-default.sql` is applied live (column default read back as v3 on Nov 11), so new leagues start on v3. One undrafted, unscored test league is still on v1; Kylie said to leave it.

Deferred items are in `BACKLOG.md` (Curtain Call podium and Home card moves — 2026-11-11; Finale follow-ups — 2026-11-11; Lifeline, Recast and Trades — 2026-11-11).

Next command (after E11 is published):
`NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --verify`
