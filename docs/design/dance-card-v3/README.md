# Dance Card v3 — flat judges' rate, tapering survival

Kylie, 2026-11-10. Replaces v2's season curve in Season 35 after a review of
what v2 actually did (the curve made a couple's next 24 worth less the more it
had already scored, which nobody had asked for).

## Principles

1. Dance Card counts the same as Curtain Call and Grand Finale (weight 1 each).
2. After the draft, Dance Card results are mostly outside managers' control,
   so one bad couple shouldn't sink a manager.
3. Pay for what happens on the dance floor at one rate: a 24 is a 24.
4. Don't pay the same thing twice. A couple that lasts is already paid by its
   judges' scores every week, so survival tapers and placement is gone.

## Rule (frozen in `frozen-rule.json` before any v3 standings were computed)

```
judges   = rate_N × the week's judges input, rounded to cents each week
survival = 3.00 × √n in total, n = survival weeks from the Anchor Week;
           each survival week pays the change (3.00, 1.24, 0.95, 0.80, 0.71 …)
bonus    = Fantasy Bonus at face value
placement = 0
rate_N   = 0.5832 · 0.2731 · 0.1755 · 0.1212 · 0.0717 · 0.0676 (N = 1–6)
```

`rate_N` is solved on the schedule model so a median roster's Dance Card
season is still 100 points per unit of weight (`solveDanceCardV3Rates`).

## Why 3.00 × √n

Under a flat judges' rate, roster spread barely moves with survival's shape
(36–38% on the season-end projection), and it keeps falling as survival grows
into a participation prize, so "lowest spread" alone can't pick the numbers.
For a survival budget of about 13% of a long run's points, paying it early
(3.00 × √n) gives the lowest spread (36.0%, against 37.1% for 1.56 tapering
gently). A curve on the judges' rate goes lower (v2: 32.7%) only by making
the same score pay differently, which principle 3 rules out.

Measured on real standings through Week 8, Dance Card at equal weight
separates managers about as much as Curtain Call. The real luck swing was
placement at the finale, which v3 drops. A league that weights Dance Card far
above the other modules is the remaining outlier; that is its weights, not
the formula.

## Amendment: every finalist survives the Finale (Kylie, 2026-11-11)

The show has no elimination on Finale night, only places, but the app enters
the couples placed below third as Eliminated. Under the frozen wording that
cost them the Finale's survival step (3.00 × (√10 − √9) = 0.49 for a couple
that survived every week from Week 2) while the podium got it. In the week a
winner is named, every couple with an outcome now survives unless it withdrew
or had a bye (`survivingCoupleIds`). Nothing before the Finale changes, and
`rate_N` stays as solved: the schedule model still gives fourth place no
survival that night, a difference of under half a point a season.
`frozen-rule.json` is the record of the rule as first frozen and is left as
it was.

Machinery is v2's (`danceCardLedger`, later-week rebuilds, reveal guard,
`set_dance_card_points`); see `docs/design/dance-card-v2/`.
