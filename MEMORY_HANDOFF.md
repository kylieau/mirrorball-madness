# Session Handoff — 2026-11-10 (Dance Card v3 live in all four leagues)

## 1. Current State

**Dance Card v3 is live in all four Season 35 leagues, switched before E10 (Tue 2026-11-10, 8pm ET).** `main` is at `79ff033` plus this sync, all pushed. The code commit `4fd806d` deployed on Vercel (success).

What v3 is (`docs/design/dance-card-v3/`):
- Judges' points pay one rate all season: 0.2731 for two-couple rosters.
- Survival is 3.00 × √(safe weeks) in total.
- The Fantasy Bonus pays at face value. No placement.

Verified 2026-11-10:
- `apply-dance-card-v3.sql` is applied: the constraint, all four functions and the grants.
- A throwaway v3 league looked right in the browser against live data.
- All four leagues switched v2 → v3 (commissioners agreed, per Kylie), and `--verify` matches.
- Curtain Call and Grand Finale are unchanged on all 175 rows.
- Ranks are identical to v1 in every league. In Carrie Ann's Biggest Fans, balla is 1st with 880.74 and Kylie 2nd with 880.62.

Tests: 907 pass and the build is clean. Codex reviewed the change and found one P1 (the correction cascade dropped outcomes), fixed in `4fd806d`.

Not yet done:
- E10 tonight is the first live v3 publish.
- `apply-dance-card-v3-default.sql` hasn't been run.
- Kylie hasn't checked a real v3 league on her phone.

## 2. Changes Made

All committed and pushed on `main`. This sync touches `MEMORY_HANDOFF.md` and `BACKLOG.md`.

**Not ours; leave unstaged:**
- `.devcontainer/devcontainer.json`, `.devcontainer/Dockerfile.codex`, `.devcontainer/devcontainer-lock.json`
- `.agents/`, `AGENTS.md`
- `ios/App/App.xcodeproj/project.pbxproj`
- `supabase/queries/add-*.sql`, `supabase/queries/prefill-*.sql`

## 3. Key Decisions

**Dance Card v3** (Kylie, 2026-11-10). It replaces v2, whose curve made a couple's next 24 worth less the more it had already scored; Kylie hadn't realized v2 worked that way. The principles:
- Equal module weights.
- Dance Card is mostly out of managers' control after the draft, so one bad couple shouldn't sink a manager.
- A 24 is a 24.
- No paying twice: survival tapers and placement is gone.
- Roster spread has no floor under a flat rate (front-loaded survival keeps lowering it into a handout), so the survival budget was set at about 13% of a long run, spent early.
- The frozen rule (`frozen-rule.json`) was written before any v3 standings were computed.

**How v3 is built:**
- It reuses v2's machinery: the `danceCardLedger` survival branch, `usesDanceCardLedger` / `danceCardLedgerRule`, `PLAN_VERSION = 5`, and `scripts/dance-card-v2.ts --to v3|v2`.
- v3 needs every outcome row with its `outcome`; the ledger throws without it.

**Copy:**
- Score History keeps v1's wording: `Jdg 30 × 0.273`, then Survival and Bonus lines.
- League Settings: a v2 league shows the Season Curve explanation, with no survival/placement sentence. A v3 league shows the rate and "3.00, Tapering", read-only.

**Earlier rounds:** I told Kylie plainly that v2 wasn't a fairness finding, and that the curve's one rank change had favored her. She chose v3 knowing it puts balla back in 1st.

**Repo is public:** never commit league standings or member names. The Curve Lab artifact (https://claude.ai/artifact/F4UocJUi5jykNmNYY3jpV3) is private and names members.

**Carried over:**
- SQL ships before the app.
- A push to `main` needs Kylie's yes in that turn (handoff syncs excepted).
- Stage by name. Never `pkill -f`. Don't run prettier.
- `rm -rf .next` before `npm run dev` after a build.
- Render-check with `scripts/qa-screenshots/seed.mjs up|down`. A new QA league's Anchor Week is 9, so set it to 2 to see points.
- The Management API (`SUPABASE_ACCESS_TOKEN`) works for verification queries.

## 4. Backlog & Next Steps

See BACKLOG "Dance Card v3 rollout — 2026-11-10".

**E10 night:**
- Contributors reload Enter Results before 8pm ET.
- Judges' points post live. Survival lands at Finish Week.
- If Finish Week fails mid-night, un-post first, then `--apply --to v2` or `--rollback`.

Next command (after E10 publishes): `NODE_OPTIONS=--experimental-websocket npx tsx --env-file=.env.local scripts/dance-card-v2.ts --verify`
