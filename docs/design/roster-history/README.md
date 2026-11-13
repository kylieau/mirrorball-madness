# A couple that changed hands

UX mocks, not production UI (2026-11-12). Kylie found that a couple's points
"disappear" once it is traded or claimed: the Couples Leaderboard gives a
couple one holder (the current or latest) and counts only that holder's
weeks, so what the earlier holder earned from it is gone from the table and
the manager's rows no longer add up to their Dance Card total. Your Fantasy
Roster and League at a Glance list the roster as of the paged week, so from
the trade's start week on the earlier holder never sees the couple again,
though their totals still include it. Score History and the stored totals
are unaffected. Couples are real; managers, points and the league are made up.

| Shot | What |
|------|------|
| `pngs/a1.png` | A1 · Couples Leaderboard, one row per holding (suggested) |
| `pngs/a2.png` | A2 · one row per couple with the whole season's numbers and a holder history line |
| `pngs/a3.png` | A3 · one row per couple, the current holder ranked, earlier holders as unranked lines under it |
| `pngs/b1.png` | B1 · Picks, former couples stay in the roster list and in League at a Glance, dimmed with a Traded / Dropped tag (suggested) |
| `pngs/b2.png` | B2 · Picks, former couples in an "Earlier this season" group of plain lines |

`board.html` holds all five; `node docs/design/roster-history/screenshot.mjs`
(from the project root) renders `pngs/`.
