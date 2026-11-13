# Session Handoff — Thu Nov 12, 2026 PT (`main` at `06f4b02`, pushed)

## 1. Current State

**In focus: removing a manager after the draft releases their roster, pushed to `main` as `06f4b02` with Kylie's yes on Thu Nov 12, 2026, after she applied `supabase/apply-remove-manager.sql` live (read back: `roster_releases` and `league_departures` present and empty, `recast_order` unaffected).** Plan and As Built in `docs/design/remove-manager/plan.md`; CLAUDE.md describes it. Advisor twice and Codex twice (plan: one P1, nine P2s; code: no P1, five P2s), every finding folded in. Checked: 1,035 tests (eight PGlite cases on the Trades fixture), tsc, lint, both dialogs rendered in a scratch league with no console errors. **Not run: `npm run build`** (dev server up). Vercel's deploy of `06f4b02` not confirmed. Not tested: the two-connection races the locks close (PGlite is single-connection) and a correction republish after a removal. The applied SQL lacks one later line, a service-role grant on `release_effective_week`, which nothing in the app calls; the file is safe to run again any time.

**Earlier today, also pushed and live:** the waiver order is reverse Dance Card standings (`0310b93`, SQL applied by Kylie before tonight's run; the live order read back matched in all three leagues). `scripts/recast-run-check.ts` is the read-only run check.

**Lifeline is on in the three West-lock leagues** from Week 10 with the Equalizer (ten Week 10 picks by six managers). The Nov 11 handoff said it was off; that was wrong. The lock on Tue Nov 17, 2026, and the settlement in E11's publish are the first live runs of those paths (rehearsed in PGlite).

**Live state (S35, as last read on Thu Nov 12, 2026):**
- E10 (Week 9) is published; 6 of 16 couples still in.
- Week 10 (E11, Semi-Finals) airs Tue Nov 17, 2026. Week 11 (E12, Finale) airs Tue Nov 24, 2026.
- Recast, Trades and Lifeline are on in the three West-lock leagues (two six-team, one seven-team with Dance Card weight 2) and off in the East-lock league.
- Pending claims before tonight's run: none in the seven-team league, two and four in the six-team leagues, all on one couple still dancing; one open trade offer, no accepted trades.

**Hard dates (PT):**
- **Thu Nov 12, 2026, 9:59 PM:** first real waiver run (first cron tick 10:00 PM; check from 10:15 PM with the command below).
- **Tue Nov 17, 2026, 5 PM / 8 PM by league:** Semi-Finals lock, the trade deadline and the Lifeline lock.
- **About Thu Nov 19, 2026:** last waiver run.
- **Tue Nov 24, 2026:** the Finale.

## 2. Changes Made

**This session (all pushed in `0310b93`, `cf1c37d` and `06f4b02`):** `supabase/apply-recast-dance-card-order.sql` (new), `supabase/apply-recast-v2.sql`, `supabase/apply-remove-manager.sql` (new), `scripts/recast-run-check.ts` (new), `src/lib/recast.ts` + tests, `src/lib/recast-v2-db.test.ts`, `src/lib/trades-db.test.ts`, `src/lib/remove-manager.ts` + `remove-manager.test.ts` + `remove-manager-db.test.ts` (new), `src/lib/home-activity.ts` + test, `src/lib/home-transactions.ts` + test, `src/lib/supabase/types.ts` (hand-edited: `recast_order` columns, `roster_releases`), `src/components/recast-panel.tsx`, `league-members-section.tsx`, `leave-league-button.tsx`, `src/app/(fan)/page.tsx`, `src/app/leagues/[id]/{settings,standings,waivers}/page.tsx`, `src/app/leagues/[id]/settings/actions.ts`, `docs/design/remove-manager/plan.md` (new), `CLAUDE.md`, `BACKLOG.md`, this file.

**Not ours, uncommitted. Leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Workflow rules:**
- A push to `main` needs Kylie's yes in that turn; invoking `/sync-handoff` is that yes for the handoff commit only. Commit only when asked. Stage by name, never `git add -A`.
- Before a push she wants to know that advisor and Codex both reviewed the change; say plainly when one wasn't available. For a design, she wants both to review the plan before the build.
- No live SQL apply by the agent; Kylie applies SQL from a pasted fenced block. Live DB writes need her yes.
- The repo is public: never commit league standings or member names (an order table with names is fine in chat, never in a file). No secrets in code.
- For a UI placement change: a mock or screenshot first, then Codex and UX/UI review before the push.
- Don't run prettier. Never `pkill -f`. Never build while the dev server runs.
- No turning Recast, Trades or Lifeline on in a live league for her. In-app Recast copy says "waiver".
- Throwaway accounts and a scratch league are fine for testing (`scripts/qa-screenshots/seed.mjs up|down`); delete them when done. Turning Recast on in the scratch league is a direct `leagues` update, scratch only.
- Scratchpad scripts run from the project root with `--input-type=module -e "$(cat file)"` (ESM can't resolve `node_modules` from the scratchpad).

**Product decisions Kylie settled (details in `CLAUDE.md`):**
- **Removing a manager after the draft** (Thu Nov 12, 2026): a drop of the whole roster at the first week that hasn't aired; aired weeks still score; the bracket is kept (a correction republish rebuilds from it); a removed user can't rejoin a drafted league; Leave League takes the same path; the log word is "Released".
- **Waiver order is reverse Dance Card standings** (Thu Nov 12, 2026), applied before tonight's run since the claimants' relative order was the same either way.
- **No second waiver run** (Thu Nov 12, 2026): a run before the show would award from the same start week. What she wants is a first-come free-agency window after the run until the lock, for next season (`BACKLOG.md`).
- **Grand Finale distance** counts weeks; the Finale is one week split between its places. **Dance Card v3:** every finalist survives the Finale; rates frozen for S35. **Waiver run:** 48 hours after results, never without. **Lifeline** pays half the couple's credit whatever its outcome. **"Open spot"** is the one name for an empty roster spot.
- **Review leftovers:** Kylie is happy for the agent to start anything it thinks should get done (Wed Nov 11, 2026). The adversarial audit of the four paths not yet run live was offered and deferred (`BACKLOG.md`).
- **Trades:** no trade-offer row on Picks and no combined Transactions page until she has used the build.

## 4. Backlog & Next Steps

1. **After 10:15 PM PT on Thu Nov 12, 2026:** run the check command below. Expected: a Week 9 row per league with start week 10, awards 0 / 1 / 1, trades 0, pending claims 0, one `awarded` plus one `taken` in one six-team league and one `awarded` plus three `taken` in the other, one open roster row starting Week 10 in each of those two. An award of 0 where 1 is expected: the claim's `result` is the diagnosis. No row at all: the cron job (`select jobid, jobname, schedule, active from cron.job;` and `cron.job_run_details`, SQL Editor only). Then Kylie looks at Home's Recent Activity and each Adds and Drops log on her phone.
2. **Phone checks once Vercel has `06f4b02`:** the Waiver Order fold's intro and Dance Card figures, the Remove and Leave dialogs' copy in League Settings, plus the Nov 11 items (pinned title under the notch, Results' carousel swap, the league switcher, the Transactions card and pages).
3. **Kylie decides** whether to tell the v3 commissioners about the Finale survival amendment, ideally before Tue Nov 24, 2026.
4. **After E11 is published (after Tue Nov 17, 2026):** `scripts/dance-card-v2.ts --verify`, and `lifeline_payouts` against the Week 10 picks (first live Lifeline settlement).
5. **When Week 11 picks open:** look at the live podium form and the Home card's move lines.
6. **Optional:** upload the two handoff skills to each claude.ai account Kylie uses.

Deferred items are in `BACKLOG.md` (Remove a manager leftovers; Free agency next season; the adversarial audit; Waiver order; Lifeline, Recast and Trades; Curtain Call podium and Home card moves; Finale follow-ups).

Next command (after 10:15 PM PT on Thu Nov 12, 2026):
`NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/recast-run-check.ts`
