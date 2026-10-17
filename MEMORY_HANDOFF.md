# Session Handoff

## 1. Current State
**UX audit and its first fix round are done, pushed and deployed.** Branch `main` at `d4f20d0`, in sync with `origin/main`. Vercel shows Ready for `d4f20d0`.

**Commits this session, in order:**
- **`ff71936`:** Hold the Curtain keeps "Today 8 PM PT" together when the sub wraps.
- **`aafc87b`, `0c7bf20`:** `.claude/skills/frontend-design/` (with its Apache-2.0 `LICENSE.txt`) and `.claude/skills/web-design-guidelines/`, copied as published plus a "Mirrorball Madness house rules" section deferring to CLAUDE.md.
- **`836a2b7`:** `docs/ux-audit.md`, a read-only audit with 22 findings and a Status section at the top.
- **`574ebca`:**
  - `Button` gets a touch-only 44px hit area at every size (`pointer-coarse:` invisible `::before`; icon sizes widen 4px a side).
  - Enter Results' per-couple actions are standard size.
  - The bracket and draft-order arrows have labels.
  - Empty Manage Leagues shows full-size Create/Join.
  - Error text is `text-danger-text` with `role="alert"`.
- **`745f2ab`:** branded `src/app/not-found.tsx` and `src/app/error.tsx`.
- **`c7a7bcc`:**
  - Lock and deadline times go through `formatAirsAt` ("Locks Tuesday 8 PM ET"; dates get a comma).
  - Amber text uses the `--amber-text` token.
  - Long names wrap (`wrap-anywhere`); no page scrolls sideways at 360px.
  - Title Case and "…" pass.
  - Shared `SubmitButton` (`src/components/submit-button.tsx`) gives pending states on sign-in, sign-up and join.
  - Autocomplete hints.
- **`3ff080f`:** `@custom-variant dark` always applies and `color-scheme: dark`, so light-mode and dark-mode phones are pixel-identical (look A).
- **`d4f20d0`:** `league_invite_preview` RPC (the only one granted to `anon`; SQL run live by Kylie, types regenerated); `/join/[code]` names the league, flags unknown codes, and disables Join mid-draft.

**Verified:** each batch in a production build at 360/390px with scratch accounts:
- hit-area probes;
- old-vs-new pixel diffs, with no layout shift;
- light vs dark appearance;
- 404 pages;
- auth pending states;
- all five invite-page states.

Build, `eslint src`, tsc and 612 tests pass. All scratch leagues and users are deleted, and `.next` is removed. The dev server is stopped.

**Not verified:**
- `error.tsx` was never triggered.
- Enter Results' per-couple row as a super admin (Publish is visible only to super admin).
- The phone-only touch feel.

Next live night: E07 (Week 6), Tue Oct 20, 8 PM ET.

## 2. Changes Made
Everything from this session is committed and pushed (see above). This sync touches only `MEMORY_HANDOFF.md` and `BACKLOG.md` (new "UX audit follow-ups" section).

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`
- `.devcontainer/Dockerfile.codex`
- `.devcontainer/devcontainer-lock.json`
- `.gitignore`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/prefill-s35-e06-dances.sql`
- `supabase/queries/add-bryan-s35-w05-curtain-call.sql`

## 3. Key Decisions
- **Look A is the one fixed look:** `dark:` always applies, enforced in `globals.css`; recorded in CLAUDE.md Settled Decisions.
- **Settings "I last watched" mid-East stays unlocked** (settled 2026-10-16). It calls `unlock_draft_scores_through`, the same call East Stay Updated makes.
- **Button hit areas live in the primitive.** Don't put visuals in `before:` on a `Button`, and don't hand-roll tap padding (CLAUDE.md UI Component Patterns).
- **Error text:** `text-danger-text` plus `role="alert"`. `destructive` is for fills and borders only.
- **Invite preview tradeoff accepted:** anyone with a valid code sees the league name and manager count before signing in.
- **Forgot password is blocked on SMTP;** see BACKLOG. The auth `useActionState` rewrite is deferred until after E07 as its own deploy.
- **Live-data safety:** never fake `draft_couple_releases` or live `dance_scores` on the real season for QA; use a temporary fixture route instead (delete it, then `rm -rf .next`). On Enter Results, never select a week as a scratch user, because it seeds correction drafts.
- **Supabase has two projects** on Kylie's account: `mirrorball-madness` (`wssbwgtsejamlbvfofvu`, the app) and `fan-friction`. When handing over SQL, name the project.
- **Attribution:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (current harness reminder).
- **QA method:**
  - Build with `next build` + `next start` (memory is tight; builds take about 8–10 minutes). Run scripts in the scratchpad that import `playwright-core` by absolute path.
  - Kill servers with `kill $(pgrep -f "^next-server")`.
  - For the empty-state user, create it via `admin.auth.admin.createUser` and delete it yourself.
  - The Management API (`SUPABASE_ACCESS_TOKEN`) is fine for read-only config checks.
- **Unchanged from before:**
  - no cross-request caching;
  - `loadOtherLeaguePicks` keeps per-league lock RPCs;
  - Curtain Call lock/coast rules;
  - partial credit is 25/10 only;
  - guest-judge scaling;
  - ad-hoc scripts run from the project root with `NODE_OPTIONS=--experimental-websocket`;
  - git: `pull --rebase --autostash`, stage by name, never `add -A`;
  - edit `BACKLOG.md` with Edit, never Write;
  - the handoff skills are account-level, so don't re-add repo copies.

## 4. Backlog & Next Steps
**E07 live night (Tue Oct 20 ET):**
- re-check Home, Results, Picks, Standings and the switcher with a released draft and a live-revealed couple;
- confirm Score History `Jdg 36→27` lines;
- Kylie checks the Enter Results per-couple row and the ⓘ focus ring on her phone.

**After E07,** in BACKLOG "UX audit follow-ups":
- the auth `useActionState` rewrite;
- forgot password, once SMTP is connected;
- the remaining audit polish.

Next command: none pending.
