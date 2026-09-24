# Paste into Claude Code — PLAN only (do not implement yet)

Copy everything below the line into Claude Code as the planning prompt. Point Claude at `docs/design/west-pacific-live-reveal/` in the Mirrorball repo (or this pack folder) and attach key PNGs from `pngs/` (admin 01–04 + Home 05–07 at minimum; 08–10 + IA boards optional).

---

## Goal
Write an implementation **plan** (not code yet) for Mirrorball Madness **progressive score reveal during the Pacific / West feed window**, matching the locked UX below and the attached mocks. Explore the live codebase (especially Enter Results, Spoiler-Free, Home Recent Activity, scoring/publish). Map what exists vs gaps Push Pilot already flagged. Propose a phased ship plan with acceptance checks. Stop after the plan unless I explicitly say to implement.

## Product context
Fantasy DWTS app. Dark ballroom UI. After East airs, the super-admin drafts all couple scores, then reveals them **one at a time** while watching the delayed Pacific feed (~often 30 min late). Safe/elim is a **separate final publish**. The app must **lag the Pacific broadcast, never lead**. There is **no** ABC/DWTS data API — fully manual.

## Locked UX (do not reopen)

### A. Admin — Enter Results progressive reveal
- Live on existing **Enter Results** admin page only.
- Do **not** invent a standalone Reveal console.
- Do **not** put a Reveal button on player Home (optional super-admin Home chip deep-link to Enter Results is fine later).
- Flow: draft scores → sticky **Up next** + big **Reveal** → confirm sheet → row becomes Posted → soft **~30s undo** (restore hidden + roll back Dance Card/judges pts for anyone who saw it) → repeat.
- Progress: `N of M posted · Pacific feed`
- Row badges: Posted / Ready / Waiting
- Hint: reveal after they’ve danced on *your* lagged feed
- When dances are posted: **Publish results** for safe/elim (ends progressive mode). Super-admin only for reveal + final publish.
- Fantasy: Dance Card / judges points update **per reveal**; elimination-based points **only** on final publish.

### B. Copy split
- Theatrical hero (viewer curtain, everyone): ~7–8pm PT `Pacific feed at 8pm` · `Spoilers can wait`; 8–10pm PT **`West Coast is watching`** · same sub; then Results in when appropriate.
- Hard facts (chips / clocks / admin): **Pacific feed** · **8pm PT** fixed Pacific wall clock — never viewer-local.
- Do not replace the theatrical hero with “Pacific feed is on.”
- Viewer copy: scores appear “as they’re posted” — avoid implying frame-sync with dances.

### C. Viewer — Spoiler-Free only (two paths)
- Spoiler-Free is the **only** standing viewer preference. No Follow live. No watching-live tonight session. No Live scores strip. No “I’m watching live now” sheet. No LIVE chips on league rows. No per-dance marks.
- **SF OFF:** as each couple is revealed, Home shows scores; **Recent Activity** gets score posts (e.g. Ava scored 27 on Waltz). Provisional pts may tick with “elim pts pending.” No special prompt.
- **SF ON:** stay hidden through progressive reveals until user taps **Mark week watched**. No auto-unlock when reveals start. After final publish, SF-on users who never marked watched still need Mark week watched.
- Curtain etiquette still shows for everyone during the Pacific/West window.

### D. Explicitly out of scope (won’t ship)
- Watching-live session / night-scoped override
- Show live scores / I’ve already watched sheet (cut; Mark week watched stays as the existing catch-up control)
- Live scores strip, Watching live chip, Just-posted special mechanism
- Follow live toggle; mark each dance; Reveal on player Home; standalone Reveal console

## Visual refs (pack)
Admin: `01-admin-reveal-console.png` · `02-admin-confirm-reveal.png` · `03-admin-undo-window.png` · `04-admin-publish-results.png`  
Viewer: `05-home-sf-on-hidden.png` · `06-home-sf-off-progressive.png` · `07-home-sf-on-still-waiting.png` · `08-home-points-live.png` · `09-state-waiting-results.png` · `10-state-after-final.png`  
IA (optional): `00-system-map.png` · `00b-night-timeline.png` · `00c-eng-gaps.png` · `01-plain-flow.png` · `02-sf-ooo.png`  
Also read `00-LOCKED.md`, `README.md`, and `ia/ENG-GAPS.md` in `docs/design/west-pacific-live-reveal/`.

## Known eng reality (from prior read-only audit — verify in tree)
Today Enter Results is largely episode-wide draft/publish; single publish timestamp; full recompute on publish; SF may be UX-only over world-readable tables; limited/no results Realtime. Expect real gaps: per-couple reveal + undo, reveal vs final flags, partial/provisional scoring, data-layer spoiler enforcement, Home refresh/push. Confirm against current `main` — do not treat this paragraph as gospel if the code differs.

## What I need from you (plan deliverable)
1. **Current-state map** — Enter Results draft/publish, score storage, Spoiler-Free, Home Activity, how fantasy points recompute today.
2. **Gap list** — what must change for per-couple reveal, undo, progressive pts vs final elim pts, SF-on hiding progressive posts.
3. **Proposed schema / API / component changes** — concrete files; prefer extending Enter Results over new admin surfaces.
4. **Phased plan**
   - P0: admin reveal one couple + confirm + undo + progress chip (still no viewer progressive if needed)
   - P1: SF-off Home/Activity (+ provisional Dance Card/judges pts); SF-on stays hidden until Mark week watched
   - P2: final Publish results (safe/elim) ends progressive; elim pts; cleanup chrome
5. **Risks / edge cases** — late joiner mid-reveal; undo after some clients saw it; SF-on after final; push/lock-screen spoilers; publish before all dances posted; correction after 30s.
6. **Acceptance checklist** matching locked UX (including won’t-ship items stay absent).
7. **Out of scope** restated so we don’t rebuild the cut watching-live layer.

## Constraints
- Match existing dark ballroom tokens; don’t redesign Home.
- Spoiler-safe: SF-on must not leak scores via Activity, push, or league rows.
- App lags Pacific feed — never lead.
- Plan first; wait for my OK before coding.
- If mocks conflict with live schema, flag it and propose the closest existing field — do not invent fake backend fields as if they were real.

## Success for this planning turn
A clear phased plan I can approve, with file pointers and acceptance checks, ready for a follow-up “implement P0” message.
