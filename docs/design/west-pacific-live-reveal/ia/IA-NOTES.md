# West live reveal · IA notes

Board A = surfaces · Board B = night timeline + data states · Board C = eng gaps matrix.
Dark ballroom (plum/gold). CODE gaps = coral/amber (distinct from design NEW gold). Not phone mocks.

IA = information architecture · pages, flows, gates · not pixel UI

**Locked 2026-09-24 with Mosaic** — watching-live session / Live strip / night override = won’t ship.

## NEW

- **Live reveal mode** on existing Enter Results (Up next + Reveal per couple)
- **Confirm sheet** before each reveal
- **Undo 30s** — re-hide score + roll Dance Card / judges pts back
- Backend verbs: `reveal`, `undo`
- Progressive visibility on Home for **SF-off** via normal Recent Activity score posts (not a special Live strip)
- **Mark week watched** unchanged · no per-dance “mark dances I’ve seen”
- Optional **super-admin Home chip** `N of M posted · Reveal ›` → deep-link Enter Results
- Provisional league pts · elim pending until final (no LIVE noise chip on rows)

## EXISTING (kept / reused)

- **Player Home** page (no new player surface)
- **Enter Results** page (gains reveal — not a new Reveal console)
- **Curtain** etiquette (copy tweak: West Coast is watching / Pacific feed / 8pm PT)
- **Draft all couples · Save draft · Episode picker**
- **Publish Results** (now final safe/elim only — behavior split from progressive scores)
- **Spoiler-Free** — sole standing preference / gate
- **Mark week watched** — catch-up unlock for SF-on
- Leagues list · Recent Activity (SF-off shows score posts as revealed; SF-on stays quiet)
- Admin drafts after East (manual · no ABC API)

## WON’T ADD / WON’T SHIP

- Watching-live tonight session / night-scoped override
- “I’m watching live now” / Show live scores sheet
- Live scores strip · Just posted pulse as special live mechanism
- Watching live · tonight chip / End session
- LIVE noise chips on Your Leagues rows
- Any third path beside SF on/off + Mark week watched
- New Reveal console page
- Reveal button on player Home
- Follow live opt-in · BACKLOG “Follow live on Home” superseded
- Per-dance “mark dances I’ve seen”

Rationale: only helps minority watching while admin posts; often &lt; half of league; second mental model not worth it.

## Behavior change (existing control)

- **Publish Results** = final only (safe/elim + elim pts · ends progressive mode) — no longer all-at-once score dump

## Copy lock

| Moment | Theatrical | Hard facts |
|--------|------------|------------|
| Pre-window | — | Pacific feed at 8pm / Spoilers can wait |
| On-window | West Coast is watching | Week N · Pacific feed |
| SF-on unlock | — | Mark week watched (catch-up) |

## Fantasy timing

- Judges / Dance Card pts → **on reveal**
- Elim pts → **on final publish only**

## Viewer paths (two only)

1. **SF OFF** → progressive reveals appear on Home / Activity as admin posts · provisional pts tick · elim pending until final
2. **SF ON** → hidden through progressive reveals · Mark week watched unlocks everything posted so far (including after final)

## One-glance success

No new player page · one existing admin page gains reveal · one existing setting is the gate · two new backend verbs (reveal, undo) · final publish already exists but splits from all-at-once · **no session overlay**.

## Eng gaps (from Push Pilot)

Read-only audit of main vs progressive-reveal IA. Full short doc: `ENG-GAPS.md` · Board C.

### Exists in code (matches design surfaces)

- Enter Results `/admin/results?tab=enter` · ResultsScreen · ResultsForm · `saveEpisodeDraft` / `publishEpisodeResults` (SA)
- Episode-wide draft sandbox · status `not_started|draft|draft_correcting|published` · autosave ALL couples
- Full publish → `applyEpisodeResults` → `recomputeWeekScores` (Dance Card + survival + CC + GF)
- SF: `profiles.spoiler_free_mode` + mark watched high-water · **UX gate only** · live tables world-readable to auth
- Realtime: Draft Room only · Home/Results = SSR + `revalidatePath`
- Publish = SA · draft/propose = SA ∪ commissioner

### Missing in code (design NEW)

- Per-couple reveal / undo
- Split scores-revealed vs outcomes-final (today single `results_published_at`)
- Partial recompute / provisional pts
- Results Realtime or Home polling for progressive Activity updates
- Super-admin Home chip → Enter Results
- Data-layer SF / API gate (if still true)

### Hardest gaps (coral CODE callouts on A/B)

1. Atomic full-episode publish vs per-couple promote
2. Scoring trigger split / provisional week totals
3. Single `results_published_at` → reveal vs final flags
4. ~30s undo — no publish undo today
5. World-readable live tables — **data-layer SF required**
6. No Results Realtime for Home / Activity progressive updates
7. Multi-night weeks + week-scoped recompute
8. `startCorrection` must not fight progressive/undo
9. BACKLOG “Follow live on Home” ≠ locked lean → **won’t add / superseded**

Key paths: `src/app/admin/results/{page,actions}.ts` · `results-draft.ts` · `results.ts` · `scoring.ts` · `results-form.tsx` · `spoiler-{mode,cutoff}.ts` · `today/page.tsx` · `home-activity.ts` · schema · BACKLOG West-feed
