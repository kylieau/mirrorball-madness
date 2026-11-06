# Special dance names · options

UX mocks, not production UI (2026-11-06, before a decision). One short and
one full name per special dance, built in one place, instead of the eight
builders listed in BACKLOG "Long special-dance names".

| Shot | What |
|------|------|
| `pngs/table.png` | Every kind of special dance: Current (per screen) vs A, B, C |
| `pngs/results.png` | Fan Results card under each rule |
| `pngs/song.png` | Separate question: the song on its own line |
| `pngs/picker.png` | Enter Results couple picker, open at 360px: as built vs proposed |
| `pngs/summary.png` | Night Summary on Enter Results' Leaderboard |

Rules:
- **A · Name first**: short = the dance's name; full = "Dance Type · Name",
  or just the name when it already says the type.
- **B · Team-style**: short = "Team Slaytopia" for a team, "Villains (Trio)"
  for any other named dance, else the name; full as A.
- **C · Kind for fans**: fans see the Dance Type, admins A's names.

Found while mocking: SQL `special_dance_label` would call an auto-named team
"Team Team Dance 2" (no S35 team is auto-named).

Cost: the app-side names (Results, couple history, Home, Enter Results) are
app-only and can ship any time. Error messages come from SQL
(`special_dance_label`, and `episode-publication.ts` mirrors it), so changing
those means an apply script run first.

`node docs/design/special-dance-names/screenshot.mjs` (from the project root)
renders `pngs/`.
