# League at a Glance — ALT patterns (vs sheet)

Companion to `NOTES.md` (sheet). Same hop copy and peer anatomy; different open behavior.

## Pattern A — Inline section expand
**Tap hop → league list grows under that card on the same Picks scroll.** Own module content stays visible above the hop. The hop flips to a collapse control (`▴`). No scrim, no sheet handle, no ×.

- Collapsed state = existing `dc-compact` / `cc-compact` / `gf-compact` (byte-identical hop; **not re-exported**).
- Open: peers stack below hop inside the card; one peer expanded for module detail.

## Pattern B — Card swap
**Tap hop → card body swaps** from own picks to the league list. Same card chrome and section header. Header area shows back `‹ Your Fantasy Roster` (DC) or `‹ Curtain Call` / `‹ Grand Finale` + title **League at a Glance** + gold module chip. Back/chevron returns to own content. Peers never stay stacked under own picks on the page.

## Vs sheet (existing)
| | Sheet | Inline | Card swap |
|--|-------|--------|-----------|
| Modal overlay | Yes (scrim + handle + ×) | No | No |
| Own content while open | Dimmed behind sheet | Still visible above hop | Replaced by league body |
| Scroll context | Sheet scroll | Main Picks scroll | Main Picks scroll (card body) |
| Hop when open | Covered / unused | Collapse control | N/A (body swapped) |

## Shared (all three patterns)
- Hop when collapsed: `League at a Glance · 6 managers ›`
- Peer-row anatomy; module detail only on peer expand
- Post-lock CC/GF as before
- DC numbers: 18.62 pts, Survival & Bonuses +6.00, Ezra/Tatyana, Week 2 Viral Hits
- Lauren expanded in DC with Survival & Bonuses; Kellie expanded in CC/GF

## Deliverables (this pack)
| File | Shows |
|------|--------|
| `dc-inline-open.png` | DC own roster + open hop + peers below; GF peek proves main scroll |
| `cc-inline-open.png` | CC own locked + open hop + peers; DC peek |
| `gf-inline-open.png` | GF own + open hop + peers; DC peek above |
| `dc-swap-own.png` | DC own roster + hop (swap closed) — near-identical to compact |
| `dc-swap-league.png` | DC card body swapped to league; back ‹ Your Fantasy Roster |
| `cc-swap-league.png` | CC card swapped to league |
| `gf-swap-league.png` | GF card swapped to league |
| `compare-inline-vs-swap.png` | Side-by-side DC inline-open vs DC swap-league |

**Skipped:** `dc-inline-collapsed` / `cc-inline-collapsed` / `gf-inline-collapsed` — reuse existing compact PNGs (same collapsed hop).

---

## LOCKED (2026-09-23)

**Pattern A — Inline section expand** is the ship direction. Sheet and card swap are not.

See [`IMPLEMENTATION-BRIEF.md`](./IMPLEMENTATION-BRIEF.md).
