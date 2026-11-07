# Dance Card v2 — concave judges scoring

Review of the proposed Dance Card redesign (builder handoff, 2026-11-06),
checked against production data through Week 8 of Season 35. The full
review, including each league's before/after standings, is a private
artifact. League tables are not kept here because they name league members
and this repository is public.

## Frozen rule

`frozen-rule.json` was written before any league standings were computed
(sha256 `f1c89939b63fe1cb417a9acb5884990b0e9d5ea5b446c69e63eb29971381371f`).
It was chosen from couple-level comparisons only; the handoff's provisional
standings were already known, so the selection was not fully blind.

```
x(c,w)  = sum over the week's nights of collapseToNights(c, night)
          (all marks / marks possible × 30; bonus points in the numerator),
          plus that week's Fantasy Bonus (episode_results.bonus_points)
S(c,t)  = sum of x(c,w) from the league's Anchor Week through week t
V(c,t)  = round_half_up_cents(k_N × S(c,t) ^ 0.80)
credit  = V(c,t) − V(c,t−1), paid to whoever holds the couple that week
k_N     = 1.7309 (N=1) · 0.8884 (N=2) · 0.6117 (N=3) · 0.4589 (N=4)
survival = 0, placement = 0; Curtain Call, Grand Finale, weights, rosters unchanged
```

`k_N` is solved on the app's own schedule model (`src/lib/strong-play-ceilings.ts`:
12 couples, 4-couple finale, judges 28→21, median snake seat), the same yardstick
that produced the legacy 0.2449. It uses no couple or manager results.

Decisions (Kylie, 2026-11-07): apply to Season 35; k = 0.8884; p = 0.80;
Fantasy Bonus inside S; each night keeps paying its own night; each
commissioner agrees and members are told first; applied no earlier than the
week after E10 is published.

## Findings that correct the handoff

- Published standings already include Disney Night's team dances, pooled per
  night by `collapseToNights`. Stored Dance Card points rebuild to the cent for
  all 25 teams. The handoff's "discrepancies up to ~0.7" were its own
  individual-only rebuild (Connor 48.02 vs 47.29 = 3 × 0.2449).
- All four drafts finished on Sep 22, after the premiere and before the Week 2
  curtain. Neither premiere exit was drafted. Anchor Week 2 is correct in every
  league; adding zero-eligibility couples does not change `k`.
- The handoff's `k = 0.828428` reproduces (0.828427), but it matches the old rule
  at Week 8. Held there, Dance Card ends the season at 88.9% of the old scale.
- 2/N roster normalization holds on the schedule model within 3% for N = 1–4.

## Couple-level comparison (season end, illustrative projection)

Remaining couples projected at 25.64 a week, finishing in order of their total
through Week 8. Judges-only rows use their own model-solved `k`.

| Regime | Spread across 91 rosters | Projected 1st | Projected 5th | Jackson + Tyler vs 1st | Draft-seat spread |
|---|---:|---:|---:|---:|---:|
| Shipped | 41.1% | 104.24 | 75.39 | 73.8% | 43.9% |
| Shipped, no placement | 37.6% | 78.15 | 73.65 | 98.5% | 50.0% |
| Judges only, p = 1.00 | 37.6% | 80.60 | 76.81 | 98.1% | 50.3% |
| Judges only, p = 0.80 | 32.7% | 74.89 | 72.06 | 113.1% | 48.5% |

A week-number discount (`k · score · (nᵖ − (n−1)ᵖ)`) was tested and rejected:
its total depends on score order (reversing Jenna's weeks changes her value by
7.4%), which discounts the late, harder dances.

## Reproducing

```
NODE_OPTIONS=--experimental-websocket node docs/design/dance-card-v2/analysis/snapshot.mjs /private/path/snapshot.json
cd docs/design/dance-card-v2/analysis
DC_SNAPSHOT=/private/path/snapshot.json python3 grid.py
DC_SNAPSHOT=/private/path/snapshot.json python3 -c "exec(open('standings.py').read()); print(league_tables())"
```

Keep the snapshot outside the repository; it holds members' display names.
