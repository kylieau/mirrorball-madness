# Roster Moves · the Picks card and its pages

UX mocks, not production UI (2026-11-11). Kylie asked for a tidier Roster Moves
card on Picks and tidier Lifeline, waiver and trade pages. Nothing here is
built; she has not picked yet. Couples are real; the league, the managers and
the points are made up.

| Shot | What |
|------|------|
| `pngs/card.png` | The card: Now, A (one tappable row per move, with a Trades line; recommended), B (the buttons stay, with a gold dot and a Trades block) |
| `pngs/pages.png` | The pages: Waivers as it is now, then Waivers, Trades and Lifeline in one shared frame (back link, a switch between the moves that are on, a two-fact strip, your to-do first, order / log / rules folded) |

A's Trades line needs the viewer's open offers and accepted trades on Picks;
the Home card already reads them (`loadHomeRosterMoves`).

`node docs/design/roster-moves-pages/screenshot.mjs` (from the project root)
renders `board.html` to `pngs/`.

## 2026-11-11 · Kylie's picks so far

- Card: **A** (one row per move, with a Trades line). Pages: the shared frame **as a whole**. She loves the switch.
- The tab and row are named **Recast**, not Waivers (the lines under it still say "waiver").
- Open: she finds the vertical rows on the card and the horizontal switch on the pages incongruent. Section 3 of the board (`pngs/fit.png`) shows the picked pair and two fixes: **C** (the same switch heads the card, a status word per tab, the selected move's lines and one Open link; recommended) and **D** (rows stay, the page's tabs carry each row's mark). She picked **C** and asked whether the switch needs its status word; section 4 (`pngs/seg.png`) compares C1 (plain tabs, a gold dot; recommended) with C2 (a status word per tab). She picked C1 and it is built (below).

## Built 2026-11-11

Card C1 and the page frame are in the app: `RosterMovesSwitch`, `RosterMoves`, `RosterMovesFrame`, `FoldCard`, and the reworked Recast (Claim sheet), Trades (You give / You get, two-box propose) and Lifeline pages. `CLAUDE.md` describes what shipped; the board is the record of the options.
