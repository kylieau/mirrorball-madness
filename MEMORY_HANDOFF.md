# Session Handoff — Fri Nov 20, 2026 PT (`main` at `ffe3b66`, pushed and deployed)

## 1. Current State

**In focus: Lifeline on any open spot, pushed, live and verified. Nothing is uncommitted from this work.**
- **The rule** (`d04c6da`, Kylie, Thu Nov 19, 2026): a roster spot is open for a week when no couple in it is still dancing, whether its couple went home or a trade emptied it. `supabase/apply-lifeline-open-spots.sql` was applied live by Kylie. Checked with a throwaway scratch league against the live project: a pick on a trade-emptied spot saved, a full spot and a spot past the roster size were refused.
- **The roster card** (`b9c4577`, `ffe3b66`; Kylie picked option C, `docs/design/roster-lifeline/`): each open spot is a dashed card on Your Fantasy Roster: the Lifeline with `½ their week` before scoring, its points after, or an Open Spot card with `Pick ›`. "In place of" is left off when the couple that went home is still held that week. Seen in a scratch league in Chromium only, not on a phone.
- **Codex review fixes** (`db25317`, `ffe3b66`): a manager with no couple gets every spot; the Equalizer counts only periods a couple held; `supabase/apply-lifeline-standings-payees.sql` (applied live by Kylie) makes `weekly_manager_standings` list every team and week with a score row, payout or adjustment. Verified live: all 225 view rows identical before and after.
- Reviewed by the advisor (a duplicate subagent was stopped) and Codex; tests (1062), `npx eslint src` and `npm run build` pass. **Kylie confirmed `ffe3b66` is the live deployment** (Fri Nov 20, 2026).

**Earlier this session, also pushed:** `f9f1f64` (Picks shows the coming week's roster once it changes hands), `67f14bd` (one row per couple on the Couples Leaderboard; open spots only with a couple to claim), `331e1bb` (clearer Lifeline and waiver lines; no Safe tag before a week airs), `fcece8a`.

**Live state (S35, as last read Fri Nov 20, 2026):**
- Week 10 (E11, Semi-Finals) is published. Week 11 (E12) is the Finale, the last scoring week, airing Tue Nov 24, 2026. The trade deadline and the last waiver run have passed.
- Lifeline, Recast and Trades are on in the three West-lock leagues. Only Kylie's own team is short a couple for Week 11 (its spot emptied by a trade after Week 9), so its Week 11 Lifeline is the first one on a trade-emptied spot.
- **After-E11 checks done Fri Nov 20, 2026 (read-only):** `scripts/dance-card-v2.ts --verify` matched in all four leagues; Week 10 had 12 Lifeline picks and 12 stored payouts, each equal to `buildLifelinePayouts` recomputed from `dance_card_snapshot`, none at zero.

## 2. Changes Made

**This session, all pushed:** `supabase/apply-lifeline-open-spots.sql` and `supabase/apply-lifeline-standings-payees.sql` (new), `src/lib/lifeline.ts`, `lifeline-picks.ts`, `lifeline-week-data.ts`, `home-roster-moves-data.ts`, `league-triage.ts` and their tests, `lifeline-db.test.ts`, `src/components/{roster-card,roster-moves,lifeline-card,lifeline-settings}.tsx`, `src/app/leagues/[id]/picks/page.tsx`, the Nov 17/18 commits' files, `docs/design/coming-week-roster/` and `docs/design/roster-lifeline/` (new), `CLAUDE.md`, `BACKLOG.md`, this file.

**Not ours, uncommitted. Leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Workflow rules:**
- A push to `main` needs Kylie's yes in that turn; invoking `/sync-handoff` is that yes for the handoff commit only. Commit only when asked. Stage by name, never `git add -A`.
- Before a push she wants the advisor and Codex to have reviewed the change; say plainly when one wasn't available. The `/advisor` tool (Opus) sees the whole conversation, so don't also spawn a cold Opus subagent for the same review. If Codex replies that it is waiting for a go-ahead, send it one (SendMessage); if it dies on a rate limit, run `node /home/node/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs task --fresh "…"` directly.
- No live SQL apply by the agent; Kylie applies SQL from a pasted fenced block. Live DB writes need her yes; verify read-only. `lifeline_slot_is_dead` is revoked from the service role too, so check it through a throwaway account's `set_lifeline_pick`.
- The repo is public: never commit league standings or member names. No secrets in code.
- For a UI placement change: a mock first (lettered options, she picks), then review before the push.
- Don't run prettier. Never `pkill -f` (stop the dev server by PID from `ss -ltnp`). Never build while the dev server runs.
- Scratch league: `scripts/qa-screenshots/seed.mjs up|down`; scratch-only direct writes are fine; tear down when done. Ad-hoc scripts run from the project root via `node --env-file=.env.local --input-type=module - args < file.mjs` with `NODE_OPTIONS=--experimental-websocket`; don't chain setup steps with `&&` after a `grep -v` that may print nothing.
- No turning Recast, Trades or Lifeline on in a live league for her. In-app Recast copy says "waiver".

**Product decisions Kylie settled (details in `CLAUDE.md`):**
- **Lifeline covers any open spot** (Thu Nov 19, 2026), whatever emptied it. Selling a couple for points and then taking a Lifeline is allowed (Codex: limited by the 10% trade cash cap). The Equalizer stays as stored.
- **Roster card** shows each open spot as a card (option C, Fri Nov 20, 2026); no Safe tag on a week that hasn't aired (option A, Wed Nov 18, 2026).
- **Couples Leaderboard is one row per couple** (Tue Nov 17, 2026, reversing the per-holder rows of Fri Nov 13).
- **Trades** clear when the 24-hour veto window closes; **removing a manager** releases the roster at the first unaired week; **waiver order** is reverse Dance Card standings, one run per week, no second run this season.
- **Grand Finale distance** counts weeks, the Finale split between its places. **Dance Card v3:** every finalist survives the Finale; rates frozen for S35. **Lifeline** pays half the couple's credit whatever its outcome. **"Open spot"** is the one name for an empty roster spot.
- **Notifications:** in-app `/notifications` only; no push or service worker.

## 4. Backlog & Next Steps

**Hard dates (PT):**
- **Tue Nov 24, 2026:** the Finale (Week 11, E12). Kylie should save her Lifeline for the trade-emptied spot before the Week 11 lock.
- **Before Tue Nov 24, 2026:** Kylie decides whether to tell the v3 commissioners about the Finale survival amendment (`BACKLOG.md`, Finale follow-ups).

**Next steps:**
1. **After E12 publishes (Tue Nov 24, 2026):** `scripts/dance-card-v2.ts --verify`; recompute Week 11 `lifeline_payouts` with `buildLifelinePayouts` over `lifelineSeason(dance_card_snapshot)` and compare with the stored rows (as done for Week 10; a tsx script needs the `.mts` extension for top-level await and must run from the project root); confirm Kylie's league's Week 11 payout for the trade-emptied spot is above zero.
2. **Phone checks** of the Nov 11 to Nov 20, 2026 UI (`BACKLOG.md`, Picks and Couples Leaderboard changes).
3. **The paused notifications question** (`BACKLOG.md`, Notifications): an assessment with options, no build until she picks.

Deferred items are in `BACKLOG.md` (Lifeline on any open spot; Picks and Couples Leaderboard changes; Finale follow-ups; Notifications; Free agency next season; the adversarial audit).

Next command: none pending until E12 publishes (Tue Nov 24, 2026); then `NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --verify`.
