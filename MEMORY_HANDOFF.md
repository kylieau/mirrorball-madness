# Session Handoff — Wed Nov 25, 2026 PT (`main` at `8d1119e`, pushed and deployed)

## 1. Current State

**In focus: the season wrap (`8d1119e`), pushed and live. Nothing is uncommitted from this work.**
- After the Finale, every fan tab switches to the season's end. **Home** (option A): the champions banner and a final result on each league card. **Results**: Final Placements and Season at a Glance on the Finale's week. **Standings**: Final Standings with a podium and Module Leaders. **Picks**: a Season Recap page after Week 11 (`?week=season`), with Transactions hidden. 4th and 5th place read as finalists, never as Eliminated, everywhere. `CLAUDE.md` (Season wrap) has the details; the mock is in `docs/design/season-wrap/`.
- **Checks run:**
  - 1091 tests, `tsc`, eslint and build all pass.
  - Codex and the advisor reviewed the change and their findings are fixed.
  - Vercel's commit status reads success.
  - Both production domains serve Final Placements and Season at a Glance to signed-out visitors.
  - The Home wrap banner was seen signed out at 390px on the dev server, with the clock pinned.
- **Not checked:** Home's final league cards, Final Standings and the Picks Season Recap, because they need a sign-in. Kylie was asked to look at them on her phone.
- Home's champions banner, the final league cards and Picks' recap only appear after the Finale's West feed ends (10 PM PT, Tue Nov 24, 2026).

**Earlier this session, all pushed, with SQL applied live by Kylie before each deploy:**

| Commit | Change | SQL |
|---|---|---|
| `69d7a7b` | Per-round draft slots | `apply-draft-dance-slots.sql` |
| `946db9b` | Remove and reorder any round, Round 1 included | `apply-episode-rounds-reorder.sql` |
| `e3df720` | Publish one dance at a time | `apply-per-dance-publish.sql` |
| `232045c`, `38ea3bd`, `12afe55` | A status row per round in place of the In progress / Drafted / Published chips (mock B) | none |
| `2158f8c` | Finale 4th / 5th Place (`final_place`) | `apply-finale-places.sql` |

All of these were used live on Finale night.

**Live state (S35):** Week 11 (E12, the Finale, aired Tue Nov 24, 2026) is published; production's Results shows it to signed-out visitors, and guests only ever see published weeks. The season is over, with nothing new to build for S35. The after-Finale verification ran read-only on Wed Nov 25, 2026 and passed: `dance-card-v2.ts --verify` matches in all four leagues, all 21 stored Lifeline payouts match a recompute, and the trade-emptied spot in Kylie's league paid 8.68.

## 2. Changes Made

**This session, all pushed:**
- **SQL:** the four SQL files above and `supabase/schema.sql`.
- **Enter Results:** `results-form.tsx`, `results-draft-input.ts`, `reveal-state.ts`, the episode-rounds files, and the Finish Week and publication-plan files.
- **Season wrap (new):** `src/lib/season-wrap.ts`, `season-wrap-data.ts`, `src/components/final-standings.tsx` and `season-recap.tsx`.
- **Season wrap (changed):** `episode-banner.ts` / `.tsx`, `league-triage-card.tsx`, `league-home-summary.ts`, `weekly-results-view.tsx`, and the Home, Manage Leagues, Results, Picks and Standings pages.
- **4th / 5th display sites:** `spoiler-safe-couple-status.ts`, `results-outcome.ts`, `home-activity.ts`, `roster-weekly-points.ts`, `roster-card.tsx`, `couple-history*.ts` and `grand-finale-*`.
- **Tests, docs and this file:** their tests, `docs/design/season-wrap/`, `CLAUDE.md`, `BACKLOG.md` and this file.

**Not ours, uncommitted. Leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Workflow rules:**
- **Pushing and committing:** a push to `main` needs Kylie's yes in that turn. Invoking `/sync-handoff` is that yes for the handoff commit only. Commit only when asked. Stage by name, never `git add -A`.
- **Reviews before a push:** she wants the advisor and Codex to have reviewed the change; say plainly when one wasn't available. The `/advisor` tool sees the whole conversation, so don't also spawn a cold Opus subagent for the same review. If Codex replies that it is waiting for a go-ahead, send it one (SendMessage). If it dies on a rate limit, run `node /home/node/.claude/plugins/cache/openai-codex/codex/1.0.6/scripts/codex-companion.mjs task --fresh "…"` directly.
- **Live database:** don't touch the Supabase DB directly (preview and prod share it) and don't change published weeks. Kylie applies SQL from a pasted fenced block, and the app deploys only after its SQL. Live DB writes need her yes; verify read-only, and when a check needs a write, ask her to run read-only queries instead.
- **Public repo:** never commit league standings or member names. No secrets in code.
- **UI placement changes:** a mock first (lettered options, she picks), then review before the push. If a deploy fails, roll back by redeploying the previous good commit.
- **Dev server and formatting:** don't run prettier. Never `pkill -f`; stop the dev server by its PID from `ss -ltnp`. Never build while the dev server runs.
- **Scratch league:** `scripts/qa-screenshots/seed.mjs up|down`. Direct writes to the scratch league are fine; tear it down when done.
- **Ad-hoc scripts:** run from the project root via `node --env-file=.env.local --input-type=module - args < file.mjs` with `NODE_OPTIONS=--experimental-websocket`.
- **League features:** don't turn Recast, Trades or Lifeline on in a live league for her. In-app Recast copy says "waiver".

**Product decisions Kylie settled this session (details in `CLAUDE.md`):**
- **Rounds:** Round 1 is on by default but can be removed and reordered like any round (Tue Nov 24, 2026).
- **Publishing:** Kylie can always publish, with no time lock, one dance at a time (Tue Nov 24, 2026).
- **Round status:** a status marker on each couple's card, one per round, replaces the In progress / Drafted / Published chips (mock B, Tue Nov 24, 2026).
- **4th and 5th Place** only in the week marked Finale. The couple stays Eliminated for scoring and eligibility, but reads as a finalist, never Eliminated, on every fan surface. Entering the places before or after the rest of the results makes no difference.
- **Season wrap:** Home option A. Picks keeps Week 11 as a normal page and adds a final Season Recap page. Tied totals share a place.

**Still in force from earlier sessions:**
- Lifeline covers any open spot.
- Couples Leaderboard: one row per couple.
- Trades clear when the veto window closes.
- Grand Finale distance counts weeks.
- Dance Card v3: every finalist survives the Finale.
- Notifications: in-app `/notifications` only.

## 4. Backlog & Next Steps

No hard dates remain this season.

1. **Phone checks:** the season wrap's signed-in screens (live since the Finale's West feed ended), plus the Nov 11 to Nov 20, 2026 UI. Both are listed in `BACKLOG.md`.
2. **Next season:** the rest of `BACKLOG.md` (Finale follow-ups, Notifications, Free agency, the adversarial audit).

The after-Finale verification is done (Wed Nov 25, 2026). Nothing is waiting on a command; the next step is Kylie's phone check.
