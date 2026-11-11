# Session Handoff — Wed Nov 11, 2026 PT (`main` at `ba9d64c`, pushed)

## 1. Current State

**In focus: the handoff skills, pushed to `main` as `ae471bc` and `ba9d64c` with Kylie's yes.** `/resume-handoff` and `/sync-handoff` were personal claude.ai skills on another account and weren't available on the current one. They now live in the repo at `.claude/skills/resume-handoff/` and `.claude/skills/sync-handoff/`, based on the originals and rewritten after advisor and Codex review:
- resume-handoff checks the named commit's ancestry and what landed since, surfaces deadlines between the handoff date and today, and carries on when a fetch fails.
- sync-handoff keeps other people's edits to the handoff files and stops if anything else is staged.
- **Behaviour change:** sync-handoff no longer pushes unpushed feature commits along with the handoff. It reports them and asks.

This handoff is the first run of the new sync-handoff. Zips for uploading both skills to other claude.ai accounts were built in a session scratchpad, which doesn't survive. Re-zip from `.claude/skills/` if needed.

**Earlier on Wed Nov 11, 2026, all pushed (details in `CLAUDE.md` and git):**
- the page title pinned on the fan tabs (`6204a4a`)
- the league switcher popover anchored under its button (`9657e8e`)
- Transactions / Lifeline Equalizer copy (`7df97aa`)
- the Transactions card and pages (`1554ff6`)
- the Curtain Call Finale podium, own dances first, and moves on the Home card (`3ad5f8f`; its SQL is applied live)
- Finale fairness (`1974e2f`)

**Not yet confirmed:** that Vercel has deployed any of these. None has been seen on a phone.

**Live state (S35, as last read on Wed Nov 11, 2026):**
- E10 (Week 9) is published, and `scripts/dance-card-v2.ts --verify` matched on all four leagues.
- 6 of 16 couples are still in.
- Week 10 (E11, Semi-Finals) airs Tue Nov 17, 2026. Week 11 (E12, Finale) airs Tue Nov 24, 2026.
- All four leagues: Dance Card v3; Grand Finale `distance_based` at 8.33 per correct and 2.08 lost per week off.
- Lifeline was reset at Kylie's request after E10 and is off in every league.
- Recast and Trades are on in the three West-lock leagues and off in the two East-lock ones.

**Hard dates (PT):**
- **Thu Nov 12, 2026, about 10 PM:** first waiver run (Week 9). Adds and trades start scoring in the Semi-Finals.
- **Tue Nov 17, 2026, 5 PM / 8 PM by league:** Semi-Finals lock, which is also the trade deadline.
- **About Thu Nov 19, 2026:** last waiver run, 48 hours after E11's results.
- **Tue Nov 24, 2026:** the Finale.

## 2. Changes Made

**This session (all pushed):** `.claude/skills/resume-handoff/SKILL.md` and `.claude/skills/sync-handoff/SKILL.md`, plus this file.

**Not ours, uncommitted. Leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Workflow rules:**
- A push to `main` needs Kylie's yes in that turn; invoking `/sync-handoff` is that yes for the handoff commit only. Commit only when asked. Stage by name, never `git add -A`.
- No live SQL apply by the agent; Kylie applies SQL. Live DB writes need her yes. League data backups go in the scratchpad only.
- The repo is public: never commit league standings or member names. No secrets in code.
- For a UI placement change: a mock or screenshot first, then Codex and UX/UI review before the push.
- Don't run prettier. Never `pkill -f`. `rm -rf .next` before `npm run dev` after a build; never build while the dev server runs.
- No turning Recast, Trades or Lifeline on in a live league for her. In-app Recast copy says "waiver".

**Product decisions Kylie settled (details in `CLAUDE.md`):**
- **Grand Finale distance** counts weeks; the Finale is one week split between its places.
- **Dance Card v3:** every finalist survives the Finale; the v3 rates stay frozen for S35.
- **Waiver run:** 48 hours after a week's results are posted, never without results.
- **Lifeline** pays half the couple's credit whatever its outcome.
- **The Transactions card and pages:**
  - one Lifeline | Recast | Trades switch on the card and its pages
  - a gold dot only, with no status word
  - catch-up cards for a viewer who is behind
  - folds closed on every visit
- **Immunity** is a bonus, not a dance; a Winner's Bonus heat is entered by picking its winner.
- **Review leftovers:** she said "i think we are good" to the Lifeline / Recast / Trades leftovers in `BACKLOG.md`. Don't start any without her say-so.
- **Trades:** no trade-offer row on Picks and no combined Transactions page until she has used the build.

## 4. Backlog & Next Steps

1. **Phone checks once Vercel has `9657e8e`:**
   - the pinned title under the notch
   - Results' carousel swap as the title pins
   - the league switcher with real leagues
   - the Transactions card and pages (their times were only seen in UTC)
2. **Kylie decides** whether to tell the v3 commissioners about the Finale survival amendment, ideally before Tue Nov 24, 2026.
3. **After the Thu Nov 12, 2026 waiver run:** a read-only check that it ran for the three leagues (a `recast_cycles` row each, nothing in `recast_runs_overdue`).
4. **After E11 is published (after Tue Nov 17, 2026):** run the verify command below.
5. **When Week 11 picks open:** look at the live podium form and the Home card's move lines.
6. **Optional:** upload the two skills to each claude.ai account Kylie uses (zip each folder under `.claude/skills/`).

Deferred items are in `BACKLOG.md` (Curtain Call podium and Home card moves, Finale follow-ups, and Lifeline / Recast / Trades, all dated 2026-11-11).

Next command (after E11 is published):
`NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --verify`
