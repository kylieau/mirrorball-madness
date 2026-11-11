# Session Handoff — Wed Nov 11, 2026 PT (`main` at `8ec884e`, pushed)

## 1. Current State

**In focus: Transactions polish and the live Recast / Trades test, pushed to `main` as `02ceee8`, `69b91b9`, `689f8c2` and `8ec884e` with Kylie's yes on Wed Nov 11, 2026.**
- `02ceee8`: the Transactions pages' back link is 44px tall on touch (`RosterMovesBackLink`), "empty spot" / "empty roster spot" is "open spot" everywhere, and couple links on Waivers and Trades carry the page and its own `from`, so the couple page comes back to the Transactions page and that page still comes back to Picks with its weeks.
- `69b91b9`, `689f8c2`, `8ec884e`: a long unbroken manager name wraps in a trade offer's title and its Waiting on line, and in Home's Recent Activity (found in the scratch league with worst-case names).
- Checked: tsc, lint on `src`, 1,021 tests, headless screenshots at phone width, Codex review (one must-fix, done in `8ec884e`) and advisor review. Not seen on a phone, and Vercel's deploy of it not confirmed.

**Live test of Recast and Trades, Wed Nov 11, 2026** (scratch league, throwaway accounts, deleted after; details in `BACKLOG.md` → Lifeline, Recast and Trades): offers, accept, veto, cancel and privacy behaved; claims were refused on held or eliminated couples; Kylie ran `process_league_recast` in the SQL Editor for the run (the service role can't call it), which awarded two claims, executed the accepted trade, left the vetoed one and stamped one `recast_cycles` row; every page read right after. Not exercised: a points leg in a trade, the open-offer / waiver-claim guard, Lifeline end to end. No real league was touched; `recast_cycles` is empty again.

**Live state (S35, as last read on Wed Nov 11, 2026):**
- E10 (Week 9) is published; `scripts/dance-card-v2.ts --verify` matched on all four leagues.
- 6 of 16 couples are still in.
- Week 10 (E11, Semi-Finals) airs Tue Nov 17, 2026. Week 11 (E12, Finale) airs Tue Nov 24, 2026. Both are single-night weeks.
- All four leagues: Dance Card v3; Grand Finale `distance_based` at 8.33 per correct and 2.08 lost per week off.
- Lifeline is off in every league. Recast and Trades are on in the three West-lock leagues and off in the two East-lock ones.

**Hard dates (PT):**
- **Thu Nov 12, 2026, about 10 PM:** first real waiver run (Week 9, due 48 hours after E10's publish at 2026-11-11T05:59Z). Adds and trades start scoring in the Semi-Finals.
- **Tue Nov 17, 2026, 5 PM / 8 PM by league:** Semi-Finals lock, which is also the trade deadline.
- **About Thu Nov 19, 2026:** last waiver run, 48 hours after E11's results.
- **Tue Nov 24, 2026:** the Finale.

## 2. Changes Made

**This session (all pushed):** `src/components/roster-moves-frame.tsx`, `roster-moves-unavailable.tsx`, `recast-panel.tsx`, `trades-panel.tsx`, `lifeline-card.tsx`, `roster-moves.tsx`, `home-dashboard.tsx`; `src/app/leagues/[id]/{waivers,trades,lifeline}/page.tsx`; `src/lib/trades.ts`, `src/lib/lifeline-picks.ts`; `CLAUDE.md`, `BACKLOG.md`, this file.

**Not ours, uncommitted. Leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Workflow rules:**
- A push to `main` needs Kylie's yes in that turn; invoking `/sync-handoff` is that yes for the handoff commit only. Commit only when asked. Stage by name, never `git add -A`.
- Before a push she wants to know that advisor and Codex both reviewed the change; say plainly when one of them wasn't available.
- No live SQL apply by the agent; Kylie applies SQL. Live DB writes need her yes. League data backups go in the scratchpad only.
- The repo is public: never commit league standings or member names. No secrets in code.
- For a UI placement change: a mock or screenshot first, then Codex and UX/UI review before the push.
- Don't run prettier. Never `pkill -f`. `rm -rf .next` before `npm run dev` after a build; never build while the dev server runs (this session did once by mistake; the server survived).
- No turning Recast, Trades or Lifeline on in a live league for her. In-app Recast copy says "waiver".
- Throwaway accounts and a scratch league are fine for testing (`scripts/qa-screenshots/seed.mjs up|down`); delete them when done.

**Product decisions Kylie settled (details in `CLAUDE.md`):**
- **Grand Finale distance** counts weeks; the Finale is one week split between its places.
- **Dance Card v3:** every finalist survives the Finale; the v3 rates stay frozen for S35.
- **Waiver run:** 48 hours after a week's results are posted, never without results.
- **Lifeline** pays half the couple's credit whatever its outcome.
- **The Transactions card and pages:** one Lifeline | Recast | Trades switch on the card and its pages; a gold dot only, with no status word; catch-up cards for a viewer who is behind; folds closed on every visit.
- **"Open spot"** is the one name for an empty roster spot across Lifeline, Recast and Trades (Kylie kept the agent's lean on Wed Nov 11, 2026, "unless i see it later and don't like it").
- **Immunity** is a bonus, not a dance; a Winner's Bonus heat is entered by picking its winner.
- **Review leftovers:** Kylie is happy for the agent to start anything it thinks should get done (Wed Nov 11, 2026); the earlier "don't start any without her say-so" reading was wrong.
- **Trades:** no trade-offer row on Picks and no combined Transactions page until she has used the build.

## 4. Backlog & Next Steps

1. **After the Thu Nov 12, 2026, ~10 PM PT waiver run:** a read-only check that it ran for the three leagues (a `recast_cycles` row each, nothing in `recast_runs_overdue`), and that Home's Recent Activity and each Trade Log read right with real data.
2. **Phone checks once Vercel has `8ec884e`:** the pinned title under the notch, Results' carousel swap as the title pins, the league switcher with real leagues, the Transactions card and pages (their times were only seen in UTC; the back link's touch area).
3. **Kylie decides** whether to tell the v3 commissioners about the Finale survival amendment, ideally before Tue Nov 24, 2026.
4. **After E11 is published (after Tue Nov 17, 2026):** run the verify command below.
5. **When Week 11 picks open:** look at the live podium form and the Home card's move lines.
6. **Optional:** upload the two handoff skills to each claude.ai account Kylie uses (zip each folder under `.claude/skills/`).

Deferred items are in `BACKLOG.md` (Lifeline, Recast and Trades, with what the live test did and didn't cover; Curtain Call podium and Home card moves; Finale follow-ups; all dated 2026-11-11).

Next command (after E11 is published):
`NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --verify`
