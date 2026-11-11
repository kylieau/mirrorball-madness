# Lifeline, waivers and trades on the Home league card

How the Home league card shows a manager's roster moves, each layout in a
"needs you" and an "all set" state. The first column is what was built (Kylie,
2026-11-11: A's lines, but under Dance Card as in B): the lines sit inside the
Dance Card row under the couples, with no row or label of their own. The
options it came from:

- **A** its own Roster Moves row under Dance Card, one line per thing in play.
- **B** under the couple who went home, inside the Dance Card row.
- **C** one gold line only while something is due.

A missing Lifeline counts as Picks Due; an open spot or a trade offer is gold
only. Each mechanism's clock is its largest unit ("Locks in 5h"). A viewer who
is behind sees none of it.

Status: built (`rosterMoveRows`, `src/lib/league-triage.ts`;
`loadHomeRosterMoves`, `src/lib/home-roster-moves-data.ts`).

`node docs/design/home-card-roster-moves/screenshot.mjs` (from the project
root) renders `board.html` to `pngs/`.
