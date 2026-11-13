# Session Handoff — Fri Nov 13, 2026 PT (`main` at `7309936`, pushed)

## 1. Current State

**In focus: two features pushed to `main` with Kylie's yes early on Fri Nov 13, 2026, neither yet seen on a live trade.**
- **`bcd3ee8` Trades take effect when their veto window closes.** `supabase/apply-trade-execution.sql` was applied live by Kylie on Thu Nov 12, 2026 after the Week 9 waiver run (`process_due_trades`, called at the end of `process_due_recasts` every 15 minutes; start week `release_effective_week()`; held while an aired competition night is unpublished; `no_week_left` result). Plus veto visibility: Home card row, Transactions card lines, Trades tab dot. Plan and reviews in `docs/design/trade-execution/plan.md`.
- **`7309936` A couple that changed hands keeps every holder's points.** Couples Leaderboard one row per holder, Picks keeps former couples as dimmed Traded / Dropped cards, League at a Glance shows them too, couple page lists every holder, holdings clamped to the viewer's cutoff (also closes a spoiler leak). App only. Plan, mocks and As built in `docs/design/roster-history/`.

Both: advisor and Codex reviewed plan and code, findings folded in; tests, tsc and `npx eslint src` clean; seen in a scratch league (throwaways deleted). **Not run since: `npm run build`.** Vercel's deploy of `7309936` not confirmed. CLAUDE.md and BACKLOG.md describe both.

**Week 9 waiver run (Thu Nov 12, 2026, 10:00 PM PT) verified read-only:** ran in all three leagues, awards 0 / 2 / 1, trades 0, no pending claims, nothing overdue.

**The first live trade execution** is the one accepted offer in Kylie's own league: its veto window closes Fri Nov 13, 2026 about 7:27 PM PT, so it executes on the cron tick by about 7:45 PM PT for Week 10 and is also the first real roster-history display.

**Paused mid-question (Kylie, Fri Nov 13, 2026):** "any way to add notifications, even if not push: on Home or a signal on the avatar leading to a notification center?" Not yet answered. Orientation so far: a `/notifications` page already exists (in-app picks-due list; see the Notifications section of `BACKLOG.md`), `src/components/account-settings-sheet.tsx` and `src/lib/league-summary.ts` reference it, no notifications table in `supabase/schema.sql`. Answer as an assessment with options (badge on the avatar, Home row, a read-marker table), no build until she picks.

**Live state (S35, as last read on Fri Nov 13, 2026):**
- E10 (Week 9) is published; 6 of 16 couples still in.
- Week 10 (E11, Semi-Finals) airs Tue Nov 17, 2026. Week 11 (E12, Finale) airs Tue Nov 24, 2026.
- Recast, Trades and Lifeline are on in the three West-lock leagues (two six-team, one seven-team with Dance Card weight 2) and off in the East-lock league. Lifeline is on from Week 10 with the Equalizer.

**Hard dates (PT):**
- **Fri Nov 13, 2026, about 7:45 PM:** the accepted trade should be `executed` in `trade_offers`; check its roster rows, then Home, Picks and Standings in that league.
- **Tue Nov 17, 2026, 5 PM / 8 PM by league:** Semi-Finals lock, the trade deadline and the first live Lifeline lock; E11's publish settles Lifeline.
- **About Thu Nov 19, 2026:** last waiver run.
- **Tue Nov 24, 2026:** the Finale.

## 2. Changes Made

**This session, all pushed in `bcd3ee8` and `7309936` (46 files):** `supabase/apply-trade-execution.sql` (new), `supabase/queries/schedule-recast-cron.sql`, `src/lib/trades.ts` + test, `trades-db.test.ts`, `recast-v2-db.test.ts`, `remove-manager-db.test.ts`, `src/lib/league-triage.ts` + test, `home-roster-moves-data.ts`, `league-module-stack-data.ts`, `use-browser-time-zone.ts`, `roster-couple-points.ts` + test, `roster-weekly-points.ts` + test, `couples-leaderboard.ts` + test, `couple-leagues.ts` + test, `couple-history-data.ts`, `league-page-data.ts`, `dance-card-v2-readers.test.ts`, `src/components/{roster-moves,trades-panel,couples-leaderboard,couple-history-view,roster-card,dance-card-league-list}.tsx`, `src/app/leagues/[id]/{trades,picks,standings}/page.tsx`, `docs/design/trade-execution/plan.md` (new), `docs/design/roster-history/` (new), `CLAUDE.md`, `BACKLOG.md`, this file.

**Not ours, uncommitted. Leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Workflow rules:**
- A push to `main` needs Kylie's yes in that turn; invoking `/sync-handoff` is that yes for the handoff commit only. Commit only when asked. Stage by name, never `git add -A`.
- Before a push she wants to know that advisor and Codex both reviewed the change; say plainly when one wasn't available. For a design, both review the plan before the build. If the Codex subagent dies on a rate limit, run `node /home/node/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs task --fresh "…"` directly.
- No live SQL apply by the agent; Kylie applies SQL from a pasted fenced block. Live DB writes need her yes (service-role calls to write RPCs are refused by auto mode anyway; verify read-only).
- The repo is public: never commit league standings or member names. No secrets in code.
- For a UI placement change: a mock or screenshot first (she picks between lettered options), then Codex and UX/UI review before the push.
- Don't run prettier. Never `pkill -f` (stop the dev server by PID from `ss -ltnp`). Never build while the dev server runs.
- No turning Recast, Trades or Lifeline on in a live league for her. In-app Recast copy says "waiver".
- Throwaway accounts and a scratch league are fine for testing (`scripts/qa-screenshots/seed.mjs up|down`); delete them when done. Scratch-only direct `leagues` updates (Recast on, Anchor Week) are fine.
- Scratchpad scripts run from the project root with `--input-type=module -e "$(cat file)"` and `NODE_OPTIONS=--experimental-websocket`.

**Product decisions Kylie settled (details in `CLAUDE.md`):**
- **Trade execution** (Thu Nov 12, 2026): a trade clears when its 24-hour veto window closes, not at the next waiver run; no commissioner bypass of the window; held until an aired week is published; after the Finale it fails `no_week_left`.
- **Roster history** (Fri Nov 13, 2026): the Couples Leaderboard shows one row per holder with a weeks label (option A1, over a single row with a note), Picks keeps former couples as dimmed cards with Traded / Dropped tags (B1); a holding is public once the week before it starts is watched.
- **Removing a manager after the draft** (Thu Nov 12, 2026): whole roster released at the first week that hasn't aired; bracket kept; no rejoin; Leave League takes the same path; log word "Released".
- **Waiver order is reverse Dance Card standings**; **no second waiver run** (a first-come free-agency window after the run is next season, `BACKLOG.md`).
- **Grand Finale distance** counts weeks, the Finale split between its places. **Dance Card v3:** every finalist survives the Finale; rates frozen for S35. **Waiver run:** 48 hours after results, never without. **Lifeline** pays half the couple's credit whatever its outcome. **"Open spot"** is the one name for an empty roster spot.
- **Notifications so far:** in-app `/notifications` only; Add to Home Screen is guidance only, no service worker or push (`BACKLOG.md`, Notifications and Settled Decisions in `CLAUDE.md`).
- **Trades:** no trade-offer row on Picks and no combined Transactions page until she has used the build.

## 4. Backlog & Next Steps

1. **Answer the paused notifications question** (assessment first, options with a mock if she wants one).
2. **Fri Nov 13, 2026, after about 7:45 PM PT:** confirm the Kylie league's trade executed (`trade_offers.status = 'executed'`, roster rows ending Week 9 / starting Week 10, two `trade_transfer` adjustments if it has a points leg), then she checks Home's Recent Activity, Picks (former cards), Standings (two holder rows) and the couple pages on her phone. If still `accepted` after 8 PM PT: `cron.job_run_details` in the SQL Editor, and whether any aired competition night is unpublished.
3. **Phone checks once Vercel has `7309936`:** the veto rows on Home and the Transactions card, the Trades page facts strip, plus the Nov 12 items (Waiver Order fold, Remove and Leave dialogs) and Nov 11 items (pinned title under the notch, Results' carousel swap, league switcher).
4. **Kylie decides** whether to tell the v3 commissioners about the Finale survival amendment, before Tue Nov 24, 2026.
5. **After E11 is published (after Tue Nov 17, 2026):** `scripts/dance-card-v2.ts --verify`, and `lifeline_payouts` against the Week 10 picks.
6. **When Week 11 picks open:** the live podium form and the Home card's move lines.
7. **Optional:** upload the two handoff skills to each claude.ai account Kylie uses.

Deferred items are in `BACKLOG.md` (A couple that changed hands; Trades take effect when the veto window closes; Remove a manager; Free agency next season; the adversarial audit; Lifeline, Recast and Trades; Notifications; Finale follow-ups).

Next command: none pending.
