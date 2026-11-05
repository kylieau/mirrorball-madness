# Couple history · options

UX mocks, not production UI (2026-11-05, before a decision). Tapping a couple
opens its season: newest week first, each dance with its song and total, the
night's score (`collapseToNights`, `55/60 → 27.50`) and the week's outcome.
Couples are real; scores, songs and league details are made up.

| Phone | What |
|-------|------|
| `pngs/a.png` | A · bottom sheet over Results, Week 9 still posting (scores only, no outcome) |
| `pngs/a2.png` | A · Spoiler-Free viewer watched through Week 6: status "as of Week 6", later weeks behind Mark Watched |
| `pngs/b.png` | B · its own page (`/couples/[id]`), per-judge marks and an In Your Leagues card |
| `pngs/c.png` | C · Couples Leaderboard row expanding in place, with Full History → |

Precedent to weigh: Score History and League at a Glance were both settled as
in-place panels, never sheets (CLAUDE.md Settled Decisions). A couple, though,
is tappable from many surfaces, and Recast is already a sheet.

Spoiler rule the mocks rely on: every count, status and locked row comes from
the viewer's own progress, recomputed on the server, never from the couple's
weeks. The locked row reads "Weeks 7–8" for every couple (one eliminated in
Week 7 has no Week 8 rows, so counting theirs would leak it), header counts
cover visible weeks only, and A's "Posting Live" week shows only to a viewer
who chose Stay Updated or Mark Watched for it.

`board.html` holds all four; `node docs/design/couple-history/screenshot.mjs`
(from the project root) renders `pngs/`.
