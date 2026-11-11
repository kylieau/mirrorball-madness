# Picks · Recast and Trades entry points

UX mocks, not production UI (2026-11-10). **Kylie picked A**, built as `RosterMoves`. Kylie didn't like
the Recast and Trades buttons in the league top bar; these move them into the
Dance Card section of Picks. Couples are real; points and the league are made
up.

| Shot | What |
|------|------|
| `pngs/a.png` | A · the two buttons on Your Fantasy Roster, above League at a Glance |
| `pngs/b.png` | B · rows shaped like League at a Glance, each with a line of explanation |
| `pngs/c.png` | C · a Roster Moves card with what is waiting on you, replacing Fill Your Open Spot |
| `pngs/combos.png` | Per league: each switch is the commissioner's, so only what is on shows |

`board.html` holds all four; `node docs/design/picks-roster-moves/screenshot.mjs`
(from the project root) renders `pngs/`.
