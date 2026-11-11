# Curtain Call in the Finale: call the podium

Kylie, 2026-11-11: in the Finale week nobody goes home, so Curtain Call's
elimination pick becomes three picks, Winner, Runner-Up and Third Place. Top
scorer is unchanged.

- Each place pays that week's elimination payout (`curtainCallPayout`; 3.23 at
  the defaults with five finalists).
- A pick one place off pays half of that and two places off pays nothing
  (`PODIUM_PLACE_OFF_FRACTION = 0.5`; the first mock lost a third per place),
  always on, not tied to the In Jeopardy toggle. 4th and 5th are entered the
  same way, so both count as 4th.
- The board shows the pick card, the saved state, League at a Glance, the recap,
  Score History and the Home league card.

Status: built (Kylie approved 2026-11-11). `supabase/apply-curtain-call-podium.sql`
goes live before the app.

`node docs/design/curtain-call-finale-podium/screenshot.mjs` (from the project
root) renders `board.html` to `pngs/`.
