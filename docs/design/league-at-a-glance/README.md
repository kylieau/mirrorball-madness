# League at a Glance — design pack

**INLINE expand is the locked direction.** See [`IMPLEMENTATION-BRIEF.md`](./IMPLEMENTATION-BRIEF.md).

These are design mocks, not production UI. Implement only after product sign-off.

## Ship set

| File | Role |
|------|------|
| `IMPLEMENTATION-BRIEF.md` | Canonical brief — INLINE expand locked |
| `NOTES.md` | Sheet-pattern notes; locked ship called out at the bottom |
| `NOTES-alt.md` | Pattern A (inline) vs Pattern B (card swap); Pattern A is locked |
| `dc-compact.png` | Dance Card collapsed hop |
| `cc-compact.png` | Curtain Call collapsed hop |
| `gf-compact.png` | Grand Finale collapsed hop |
| `dc-inline-open.png` | Dance Card inline open (primary) |
| `cc-inline-open.png` | Curtain Call inline open (primary) |
| `gf-inline-open.png` | Grand Finale inline open (primary) |

## `exploration/` — non-ship

Alternatives and generators. Do not treat these as the implementation target.

- **Sheet:** `dc-sheet.png`, `cc-sheet.png`, `gf-sheet.png`
- **Card swap:** `dc-swap-league.png`, `dc-swap-own.png`, `cc-swap-league.png`, `gf-swap-league.png`
- **Compare:** `compare-inline-vs-sheet.png`, `compare-inline-vs-swap.png`, `compare-strip.png`
- **Generators:** `generate.mjs`, `generate-alt.mjs`
