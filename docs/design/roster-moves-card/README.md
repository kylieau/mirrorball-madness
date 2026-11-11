# Picks · Roster Moves card

UX mocks, not production UI (2026-11-10). **Kylie picked A**, with the advisor
and Codex both suggesting "Roster Moves" as the title with no week, since a
Lifeline is for this week, waiver adds start the next and trades have no week.
Each line names its own week instead. The lines moved off Your Fantasy Roster
because they are about the weeks still to come, while the roster card can be
paged to an earlier week. Couples are real; points and the league are made up.

| Shot | What |
|------|------|
| `pngs/a.png` | A · its own card, under the roster (built) |
| `pngs/b.png` | B · the same card above the roster (rejected) |
| `pngs/c.png` | C · a row per move with its status (would need trade offers loaded on Picks) |

`board.html` holds all three; `node docs/design/roster-moves-card/screenshot.mjs`
(from the project root) renders `pngs/`.
