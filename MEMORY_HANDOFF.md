# Session Handoff — Thu Nov 12, 2026 PT (`main` at `0310b93`, pushed)

## 1. Current State

**In focus: the waiver order is reverse Dance Card standings, pushed to `main` as `0310b93` with Kylie's yes on Thu Nov 12, 2026, and the SQL applied live by her the same afternoon, before the first real run.**
- `supabase/apply-recast-dance-card-order.sql` redefines `recast_order`: fewest Dance Card points as Standings shows them (raw `roster_points` × the league's Dance Card weight plus the already weighted `lifeline_points` and `transfer_points`), then the lower latest week, then the later draft pick; both sides compare in cents. `recastOrder`, the Waiver Order fold (which now shows the Dance Card figure), `RECAST_RULES` and CLAUDE.md say the same. `apply-recast-v2.sql` drops the function before recreating it, so re-applying it still works; the order file goes after it again.
- Checked: 1,021 tests (the DB order test fails without the weighting, without the rounding and under the old rule, proved by mutating the SQL), tsc, lint, the fold rendered in a scratch league, Codex review (one P2, the rounding mismatch, fixed) and advisor review. The live function was read back after Kylie's apply: new columns, and the order matched the Dance Card table in all three leagues. **Not run: `npm run build`** (the dev server was up). Vercel's deploy of `0310b93` not confirmed; until it lands the fold shows the old order while the run uses the new one.
- Also in `0310b93`: `scripts/recast-run-check.ts`, a read-only look at each Recast league's next run, pending claims, offers, runs done and roster rows (ids and counts only).

**Pre-flight for tonight's run (read Thu Nov 12, 2026, about 4:40 PM PT):** no `recast_cycles` rows, nothing overdue, all three Recast leagues due at 9:59 PM PT with claims starting Week 10. One open trade offer in the seven-team league, no accepted trades. Pending claims: none in the seven-team league; two in one six-team league and four in the other, every one into an open spot and all on the same couple, who is still dancing. The first claimant in line is the same under the old and new order in both leagues.

**Lifeline is on in the three West-lock leagues** from Week 10, with the Equalizer (16 `lifeline_equalizer` rows, ten Week 10 picks by six managers). The Nov 11 handoff said it was off everywhere; that was wrong. The lock on Tue Nov 17, 2026, and the settlement inside E11's publish are the first live runs of those paths (rehearsed in PGlite; the publish refuses a plan without payouts). Seen live in a scratch league on Thu Nov 12, 2026: the turn-on sheet with an empty Equalizer, the enabled pages and Turn Off, no console errors.

**Live state (S35, as last read on Thu Nov 12, 2026):**
- E10 (Week 9) is published; 6 of 16 couples still in.
- Week 10 (E11, Semi-Finals) airs Tue Nov 17, 2026. Week 11 (E12, Finale) airs Tue Nov 24, 2026.
- Recast, Trades and Lifeline are on in the three West-lock leagues (two six-team, one seven-team with Dance Card weight 2) and off in the East-lock league.

**Hard dates (PT):**
- **Thu Nov 12, 2026, 9:59 PM:** first real waiver run (first cron tick after it is 10:00 PM; check from 10:15 PM).
- **Tue Nov 17, 2026, 5 PM / 8 PM by league:** Semi-Finals lock, the trade deadline and the Lifeline lock.
- **About Thu Nov 19, 2026:** last waiver run, the only one the new order decides after tonight.
- **Tue Nov 24, 2026:** the Finale.

## 2. Changes Made

**This session (all pushed in `0310b93`):** `supabase/apply-recast-dance-card-order.sql` (new), `supabase/apply-recast-v2.sql`, `scripts/recast-run-check.ts` (new), `src/lib/recast.ts`, `src/lib/recast.test.ts`, `src/lib/recast-v2-db.test.ts`, `src/lib/trades-db.test.ts`, `src/lib/supabase/types.ts` (two renamed columns, hand-edited), `src/components/recast-panel.tsx`, `src/app/leagues/[id]/waivers/page.tsx`, `src/app/leagues/[id]/settings/actions.ts`, `CLAUDE.md`, `BACKLOG.md`.

**Not ours, uncommitted. Leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Workflow rules:**
- A push to `main` needs Kylie's yes in that turn; invoking `/sync-handoff` is that yes for the handoff commit only. Commit only when asked. Stage by name, never `git add -A`.
- Before a push she wants to know that advisor and Codex both reviewed the change; say plainly when one of them wasn't available.
- No live SQL apply by the agent; Kylie applies SQL from a pasted fenced block. Live DB writes need her yes. League data backups go in the scratchpad only.
- The repo is public: never commit league standings or member names (an order table with names is fine in chat, never in a file). No secrets in code.
- For a UI placement change: a mock or screenshot first, then Codex and UX/UI review before the push.
- Don't run prettier. Never `pkill -f`. `rm -rf .next` before `npm run dev` after a build; never build while the dev server runs.
- No turning Recast, Trades or Lifeline on in a live league for her. In-app Recast copy says "waiver".
- Throwaway accounts and a scratch league are fine for testing (`scripts/qa-screenshots/seed.mjs up|down`); delete them when done. Turning Recast on in the scratch league is a direct `leagues` update, scratch only.
- Scripts run from the project root with `--input-type=module -e "$(cat file)"` when they live in the scratchpad (ESM can't resolve `node_modules` from there).

**Product decisions Kylie settled (details in `CLAUDE.md`):**
- **Waiver order is reverse Dance Card standings** (Thu Nov 12, 2026): a claim only changes Dance Card points, so the wire goes first to the roster that needs it. She chose to apply it before tonight's run rather than after, since the claimants' relative order was the same either way.
- **Grand Finale distance** counts weeks; the Finale is one week split between its places.
- **Dance Card v3:** every finalist survives the Finale; the v3 rates stay frozen for S35.
- **Waiver run:** 48 hours after a week's results are posted, never without results.
- **Lifeline** pays half the couple's credit whatever its outcome.
- **The Transactions card and pages:** one Lifeline | Recast | Trades switch on the card and its pages; a gold dot only; catch-up cards for a viewer who is behind; folds closed on every visit. "Open spot" is the one name for an empty roster spot.
- **Immunity** is a bonus, not a dance; a Winner's Bonus heat is entered by picking its winner.
- **Review leftovers:** Kylie is happy for the agent to start anything it thinks should get done (Wed Nov 11, 2026).
- **Trades:** no trade-offer row on Picks and no combined Transactions page until she has used the build.

## 4. Backlog & Next Steps

1. **After 10:15 PM PT on Thu Nov 12, 2026:** run the check command below. Expected: a Week 9 row per league with start week 10, awards 0 / 1 / 1, trades 0 (the one open offer is unaccepted), pending claims 0, one `awarded` and one `taken` in one six-team league, one `awarded` and three `taken` in the other, and one open roster row starting Week 10 in each of those two. An award of 0 where 1 is expected: the claim's `result` is the diagnosis. If no row stamped, the cron job is the suspect (`select jobid, jobname, schedule, active from cron.job;` and `cron.job_run_details`, SQL Editor only). Then Kylie looks at Home's Recent Activity and each Adds and Drops log on her phone.
2. **Phone checks once Vercel has `0310b93`:** the Waiver Order fold's new intro and Dance Card figures, plus the Nov 11 items (pinned title under the notch, Results' carousel swap, the league switcher, the Transactions card and pages).
3. **Kylie decides** whether to tell the v3 commissioners about the Finale survival amendment, ideally before Tue Nov 24, 2026.
4. **After E11 is published (after Tue Nov 17, 2026):** `scripts/dance-card-v2.ts --verify`, and `lifeline_payouts` against the Week 10 picks (first live Lifeline settlement).
5. **When Week 11 picks open:** look at the live podium form and the Home card's move lines.
6. **Optional:** upload the two handoff skills to each claude.ai account Kylie uses.

Deferred items are in `BACKLOG.md` (Waiver order by Dance Card; Lifeline, Recast and Trades, with what the live tests did and didn't cover and the structural limit on testing a Lifeline pick in a scratch league; Curtain Call podium and Home card moves; Finale follow-ups).

Next command (after 10:15 PM PT on Thu Nov 12, 2026):
`NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/recast-run-check.ts`
