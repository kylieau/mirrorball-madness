# League at a Glance — expand-to-sheet (Picks)

## Pattern
**Tap hop → bottom sheet** (not a dropdown, not an always-open accordion).

Compact cards show **own content only**. The always-visible peer dump is replaced by one shared tappable hop:

> **League at a Glance · 6 managers ›**

Tapping opens a bottom sheet (Score History chrome language) covering most of the phone, with dimmed Picks behind it.

## Applies to (one system)
1. **Dance Card** — under Your Fantasy Roster (+ Survival & Bonuses)
2. **Curtain Call** — under own locked pick card (**post-lock only**)
3. **Grand Finale / Season Bracket** — under own Locked bracket (**post-lock only**)

Shared across all three:
- Identical hop row height, typography, chevron, icon treatment
- Shared hop copy: `League at a Glance · N managers ›`
- Identical sheet chrome: grab handle, title row + close ×, dim scrim, corner radius, padding
- Sheet title always **League at a Glance**, with a small gold **module chip** (Dance Card / Curtain Call / Grand Finale)
- Same peer-row anatomy: avatar + name + primary summary + chevron; module-specific detail only on expand inside the sheet

## Module-specific detail (sheet expand only)
- **Dance Card:** couples + **Survival & Bonuses** residual line under the expanded peer (parity with prior lean / own-card)
- **Curtain Call:** Home / High expand
- **Grand Finale:** next-elim condensed; one peer can expand to a condensed full bracket

## Unchanged
- Post-lock gates for CC / GF peer visibility stay as today (hop only appears post-lock in product; mocks show post-lock state)
- **See Everyone’s Dance Cards →** remains on Dance Card as a Standings hop (below the new league hop). Do **not** invent Standings-style peer boards on Picks for Curtain Call / GF.
- Standings Dance Cards stay a separate surface

## Deliverables
| File | Shows |
|------|--------|
| `dc-compact.png` | DC own roster + Survival & Bonuses + hop (no inline peers) |
| `dc-sheet.png` | DC sheet open; Lauren expanded with Survival & Bonuses line |
| `cc-compact.png` | CC own locked + hop (no inline peers) |
| `cc-sheet.png` | CC sheet; Kellie expanded Home/High |
| `gf-compact.png` | GF own Locked next-elim + hop (no inline peers) |
| `gf-sheet.png` | GF sheet; Kellie expanded mini bracket |
| `compare-strip.png` | Side-by-side of the three compact states |

Matching HTML sources sit alongside each PNG.

## Assumptions
- Manager count = 6 for `#supportSWEKylie` (matches prior league mocks)
- DC numbers from latest live screenshot: **18.62 pts**, +6.80 / +5.82, Survival & Bonuses **+6.00**; couples Ezra & Daniella / Tatyana & Jan
- Peer names Lauren Au / JSAK / Kellie Au / etc. match prior finale + curtain-call packs
- Shared label “League at a Glance” on every compact card (per consistency steer); module identity via gold chip in the sheet only

---

## LOCKED SHIP (2026-09-23)

**Inline section expand** won. Sheet and card-swap mocks are exploration only.

Canonical brief: [`IMPLEMENTATION-BRIEF.md`](./IMPLEMENTATION-BRIEF.md)

Primary open refs: `dc-inline-open.png`, `cc-inline-open.png`, `gf-inline-open.png`.

Collapsed refs: `dc-compact.png`, `cc-compact.png`, `gf-compact.png`.
