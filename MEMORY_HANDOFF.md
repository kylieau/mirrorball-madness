# Session Handoff — 2026-11-11 (Lifeline / Recast / Trades released to main)

## 1. Current State

Lifeline, the Equalizer, Recast v2 and Trades are on `main` (built on `lifeline-recast-trades`, fast-forwarded). Kylie applied the three SQL files and scheduled the cron job on 2026-11-11, then said to commit and push to `main` the same day. **Every switch is off in all five leagues; nothing has been tried against the live project in a browser yet.**

Checks before the commit (2026-11-11): `npx tsc --noEmit` clean, `npx eslint src scripts` clean, `npm test` 99 files / 985 tests, `rm -rf .next && npm run build` succeeds. (`npm run lint` fails only on `.codex-private/`, another session's directory.)

The Recast and Trades screens, the header and the settings rows were checked in headless chromium at 360px and 390px with made-up data on a temporary route (since removed), because the SQL isn't live. No horizontal overflow, no console errors. The Lifeline turn-on sheet and Picks card have not been browser-checked.

**Codex reviewed the built code (2026-11-11):** four P1s, no P0 or P2, each reproduced, fixed and covered by a PGlite test (see `BACKLOG.md`). The advisor could not run: the main model, `claude-fable-5-2`, doesn't support it.

**Added after Kylie's 2026-11-11 notes:** trade offers expire after 48 hours or at the Semi-Finals lock (`trade_offers.expires_at`); awarded waiver claims and trades that went through show on Home's Recent Activity (`src/lib/home-transactions.ts`). Not built, by her choice until she has used it: a trade-offer row on Picks, one combined Transactions page.

- **The plan and what was decided while building:** `docs/design/lifeline-recast-trades/plan.md` (As Built, at the end).
- **CLAUDE.md** has a section each for Lifeline and the Equalizer, Recast v2 and Trades.

**E10 `--verify` is still owed.** E10 (Week 9) aired Tue Nov 10 and is the first live v3 publish. After it is published:
`NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --verify`
Kylie released this build before E10 was published, so E10 will be the first publish through the new plan (`lifelinePayouts` / `lifelineEqualizers`, empty while no league plays). `--verify` matched on all four leagues right after the Lifeline SQL went in.

Hard dates (PT):
- Release target: Sun Nov 15 or Mon Nov 16.
- Tue Nov 17, 5 PM: Semi-Finals lock (earliest Lifeline lock; the trade deadline).
- Thu Nov 19, 5 PM: the only S35 waiver run (claims and trades).
- Tue Nov 24: the Finale.

## 2. Changes Made

All committed on `main`.

**SQL (applied live by Kylie 2026-11-11, in this order):**
- `supabase/apply-lifeline.sql`
- `supabase/apply-recast-v2.sql` (drops the old Recast RPCs: the old Recast page can't submit a claim until the deploy; no league has Recast on)
- `supabase/apply-trades.sql`
- `supabase/queries/schedule-recast-cron.sql` (`pg_cron` enabled; Kylie's `cron.job` check showed `process-due-recasts`, every 15 minutes, active)

Checked afterward with reads only: every function, table and column from the three files is present, the five old Recast RPCs are gone, `anon` is refused on every new table, the standings view matches `weekly_manager_scores` (175 rows, same total, no Lifeline or transfer points), every new table is empty, and all five leagues have Lifeline, Recast and Trades off. `--verify` matched on the four S35 leagues with the Lifeline SQL in (E10 not published yet).

**Tests:** `src/lib/lifeline-db.test.ts`, `recast-v2-db.test.ts`, `trades-db.test.ts` (PGlite); `lifeline.test.ts`, `lifeline-picks.test.ts`, `recast.test.ts`, `trades.test.ts`, `home-transactions.test.ts`; additions to `home-activity.test.ts`, `score-history.test.ts`, `episode-publication.test.ts`, `draft-scores.test.ts`, `dance-card-v2-readers.test.ts`, `couple-history-link.test.ts`.

**Logic:** `src/lib/lifeline.ts`, `lifeline-picks.ts`, `lifeline-enable.ts`, `recast.ts`, `trades.ts`, `weekly-standings.ts`, `home-transactions.ts`; changes in `home-activity.ts`, `episode-publication.ts`, `score-history.ts`, `score-history-data.ts`, `league-page-data.ts`, `league-home-summary.ts`, `draft-scores.ts`, `recast-framing.ts`, `couple-history-link.ts`, `supabase/types.ts` (regenerated from the live project 2026-11-11).

**Routes and actions:** `src/app/leagues/[id]/lifeline/`, `src/app/leagues/[id]/trades/`, `src/app/leagues/[id]/waivers/` (page and actions rewritten), `settings/actions.ts` and `settings/page.tsx`, `picks/page.tsx`, `standings/page.tsx`, `admin/results/enter/page.tsx`, `src/app/(fan)/page.tsx`.

**Components:** new `lifeline-card.tsx`, `lifeline-settings.tsx`, `recast-panel.tsx`, `recast-overdue-notice.tsx`, `trades-panel.tsx`, `trades-settings.tsx`; changed `league-header.tsx`, `league-page-shell.tsx`, `league-modules-form.tsx`, `recast-nudge-card.tsx`, `roster-card.tsx`, `dance-card-league-list.tsx`, `top-bar.tsx`; deleted `waivers-panel.tsx`.

**Docs:** `docs/design/lifeline-recast-trades/plan.md`, `CLAUDE.md`, `BACKLOG.md`, this file.

**Not ours; still uncommitted, leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`, `.codex-private/`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Kylie's answers (2026-11-10):** restate everything in v3 terms; Lifeline and the Equalizer take the Dance Card weight once; Lifeline options go through the viewer's spoiler cutoff; build all four now and release together (fallback: Lifeline and the Equalizer alone); the Equalizer is one-time and never automatic, the commissioner confirms it (default yes) after seeing every number and rank change; trades use points as cash, capped at 10% per season; no trades after the Semi-Finals lock; no mocks first, build then send screenshots.

**Storage:** `weekly_manager_scores` is unchanged. Totals are read from the `weekly_manager_standings` view through `loadWeeklyStandings`. Lifeline settles inside the publish transaction (`lifelinePayouts` / `lifelineEqualizers` on the plan, checked by `apply_lifeline_settlement`); no `PLAN_VERSION` bump.

**Decided while building, for Kylie to confirm** (full list in the plan's As Built):
- Each mechanism is its own commissioner switch, default off. Trades is independent of Recast.
- 4th and 5th in the Finale earn judges' points and bonus only; Lifeline's Finale pays half the credit whatever the outcome.
- Recast: claims private until the run; lists don't carry over; turning it on never runs a week already due; the late-run alert is an admin notice on Enter Results.
- Trades: veto = more than half of the teams not in the trade; at least one couple; up to 12 parts; everything moves at the waiver run; an offer expires after 48 hours or at the Semi-Finals lock; accepted trades can't be backed out of; trade points sit under Dance Card.
- Header: Recast and Trades are two buttons in the top bar. Under about 390px the wordmark text gives way and only the glyph shows.

**Rules that still hold:**
- No merge, deploy, live SQL apply or live DB write by the build agent. Kylie applies SQL after an explicit OK.
- No turning Recast on in the four live leagues as part of the PR. Kylie enables `pg_cron`.
- The Equalizer preview is announced to the league. If it raises Kylie's rank, the commissioner or the league decides.
- In-app Recast copy says "waiver".
- The repo is public: never commit league standings or member names.
- A push to `main` needs Kylie's yes in that turn. Commit only when asked. Stage by name. Never `pkill -f`. Don't run prettier. `rm -rf .next` before `npm run dev` after a build.

## 4. Next Steps

1. Confirm the deploy from `main` is live.
2. After E10 is published (the first publish on this build): run `--verify`.
3. Kylie uses the build and decides where Recast and Trades should surface (Picks row, one Transactions page).
4. Browser-check with throwaway accounts against the live project: Lifeline turn-on sheet and Equalizer numbers, a Lifeline pick, a waiver list, a trade offer through accept and veto.
5. Commissioners opt in before Tue Nov 17, 5 PM PT.

Open limits are listed in `BACKLOG.md` (Lifeline, Recast and Trades — 2026-11-11).
