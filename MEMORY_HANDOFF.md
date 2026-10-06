# Session Handoff

## 1. Current State
**Everything shipped; nothing uncommitted.** Local `main` == `origin/main` at `e2750ab`, production deploy green. Two things landed on 2026-10-05/06:
1. **Top-scorer within-2 band** (`7b2cf9a`, `d62e8f0`): 25% within 1 (unchanged) + new 10% within 2, hardcoded, top scorer only, behind the one In Jeopardy toggle; partial rows now label "Within 1"/"Within 2" (fixing the old "In Jeopardy" mislabel on top-scorer near misses). **Retroactively applied**: `scripts/recompute-published-weeks.ts` recomputed weeks 1–3 across all leagues — 2 of 50 rows changed, both verified exact (6.9 × 14/16 × 0.1 = 0.60); week 1 within-2 picks correctly unpaid (Anchor Week 2). tsc/lint/build/555 tests pass.
2. **PR #52 merged** (`e998f6a`..`e2750ab`): native-touch CSS pass (tap feedback, no overscroll, bigger hit targets), handoff docs, and the `github-cli` devcontainer feature.

The user will feel-test the touch pass casually on their phone (told them Tuesday's episode usage counts); BACKLOG item 8 keeps the list if anything feels off.

## 2. Changes Made
All committed and pushed; see above. **Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (separate in-progress iOS work).

## 3. Key Decisions
- **Curtain Call partial credit is two hardcoded bands, no more** (user settled 2026-10-05 after discussion; rejected 50/25 for 25/10): see CLAUDE.md's In Jeopardy bullet. Don't add a third band or a commissioner knob.
- **Retroactive scoring changes go through `scripts/recompute-published-weeks.ts`** (exported `recomputeWeekScores`), run `NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local …` from the project root. Service role can't execute `active_season_id()` — the script reads `seasons.is_active` directly. Push/deploy the engine change first, then recompute, so Score History's client-side re-derivation matches stored totals.
- **gh CLI**: installed (devcontainer feature + release binary in this container). Auth = `GH_TOKEN` from the VS Code git credential helper per command (token lacks `read:org`, so `gh auth login` refuses it and plain `gh pr view` fails; `--json` fields, pr create/list/checks/merge and `gh api` all work). The user put the export in their own ~/.bashrc; do NOT persist it from a session (denied by policy).
- **Keep `next dev` running** — the user watches the app through VS Code's preview pane on localhost:3000. Stop it for `npm run build` (shared `.next`), restart it after, always.
- **The pinned bar is the real top bar on every fan tab**; switcher/carousel scroll away — accepted cost, restore only if asked.
- **Vite rewrite declined**; light phone frame, page still scrolls; gold mirrorball icon stays; Stay Updated is the only opt-in label; West Stay is published-only; Settings "I last watched" not locked mid-East (BACKLOG item 7).
- **Builds:** never `npm run build` while `next dev` runs (`pgrep -af "next dev"`).
- **Git with a dirty other-session `project.pbxproj`:** `git pull --rebase --autostash`; stage by name; commit with a pathspec.
- **Signed-in checks without a browser:** throwaway user via admin client, in-memory cookie jar, project root, `NODE_OPTIONS=--experimental-websocket`.
- **Headless screenshot pass** (`scripts/qa-screenshots/`): seed up → dev server → shoot 360/390 → seed down. Layout only, blind to touch feel.
- **`BACKLOG.md` edits:** `Edit` or a targeted script, never `Write`.

## 4. Backlog & Next Steps
Nothing in flight. Deferred work is in `BACKLOG.md` "Up next" (item 8 now includes the touch-feel phone checks). Next session: whatever the user brings; if they report a touch-feel issue, that's the thread.

Next command: none pending.
