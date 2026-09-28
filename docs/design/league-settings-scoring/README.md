# League Settings scoring — flattened

Eng stills of `LeagueModulesForm` at 390px (fixture league, not a signed-in production league). These are the build, not the Mock Mosaic board.

## Lock (2026-09-28)

1. Modules keeps this helper: “Turn each module on or off. A section for its settings appears below once it's on.” Curtain Call, Dance Card, and Grand Finale are switches.
2. A module that is on gets a section below. Opening that section goes straight to the weight field. There is no Scoring Mix accordion or heading.
3. Under the weight, one Scoring Details expand holds that module’s existing fields.
4. A module that is off has no section.
5. Season Clock is its own section after the module sections: Anchor Week, Currently Locks, Update Anchor.
6. When Grand Finale is locked, Missed the lock and Allow late sit in that section for a commissioner or super admin. The Allow late sheet is unchanged.
7. A member sees the same structure read-only, without Allow late.

Save, `scoringLocked`, and Update Anchor are unchanged. No schema change.

## Stills

| File | What |
|------|------|
| `pngs/01-modules-overview.png` | Modules, collapsed sections, Season Clock after them |
| `pngs/02-module-weight.png` | Curtain Call open to its weight; Scoring Details collapsed |
| `pngs/03-scoring-details.png` | Scoring Details open |
| `pngs/04-grand-finale-missed-lock.png` | Grand Finale with Missed the lock |
| `pngs/05-member-readonly.png` | Member read-only |
