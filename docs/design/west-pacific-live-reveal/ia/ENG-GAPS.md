# Eng gaps · Push Pilot audit (read-only main)

Short map of codebase vs progressive-reveal IA. Design NEW (gold) ≠ CODE gap (coral).

**Locked 2026-09-24** — watching-live session is cut; not an eng gap.

## Exists (match design surfaces)

- Enter Results: `/admin/results?tab=enter` · ResultsScreen · ResultsForm · `saveEpisodeDraft` / `publishEpisodeResults` (SA publish)
- Draft sandbox episode-wide · status `not_started|draft|draft_correcting|published`
- Autosave writes ALL couples at once
- Outcomes + dance/judge scores · full publish → `applyEpisodeResults` → `recomputeWeekScores` (Dance Card + survival + CC + GF)
- Spoiler-Free: `profiles.spoiler_free_mode` + mark watched week high-water · **UX gate only** · live tables world-readable to auth
- Realtime: Draft Room only · Home/Results = SSR + `revalidatePath`
- Publish = SA · draft/propose = SA ∪ commissioner

## New (does not exist)

- Per-couple reveal / undo
- Split “scores revealed” vs “outcomes final” (today single `results_published_at`)
- Partial recompute (judges-only vs elim deferred) / provisional pts
- Results Realtime or Home polling for progressive Activity / Home updates
- Super-admin Home chip → Enter Results
- Per-couple Revealed DB state · 30s undo window
- Data-layer SF / API gate (tables world-readable once rows land)

## Won’t build (cut from design)

- Watching-live session override (distinct from `spoiler_free_mode`)
- Live scores strip / Just-posted pulse mechanism
- Watching live · tonight chip / End session

## Hardest gaps

1. Atomic full-episode publish vs per-couple promote
2. Scoring trigger split / provisional week totals
3. Single `results_published_at` → need reveal vs final flags
4. ~30s undo — no publish undo today
5. World-readable live tables — SF won’t hide API once rows land (**data-layer SF required**)
6. No Results Realtime for Home / Activity progressive updates
7. Multi-night weeks + week-scoped recompute
8. Correction path (`startCorrection`) must not fight progressive/undo
9. BACKLOG “Follow live on Home” ≠ locked lean → **won’t add / superseded**

## Key paths

`src/app/admin/results/{page,actions}.ts` · `results-draft.ts` · `results.ts` · `scoring.ts` · `results-form.tsx` · `spoiler-{mode,cutoff}.ts` · `today/page.tsx` · `home-activity.ts` · schema · BACKLOG West-feed

## Boards

- A (`00-system-map`) — surfaces + CODE badges · no session node · SF on → Mark watched only
- B (`00b-night-timeline`) — Draft→Revealed→Final · no session branch
- C (`00c-eng-gaps`) — Exists | New matrix + numbered hardest gaps (session dropped)
