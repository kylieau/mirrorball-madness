# League at a Glance — Implementation Brief (LOCKED)

**Status:** Ship direction locked 2026-09-23 (Kylie)  
**Pattern:** **Inline section expand** (not sheet, not card swap)  
**Surface:** Picks — Dance Card, Curtain Call, Grand Finale (one shared system)

---

## Problem
Always-open “League at a Glance” / peer lists on Curtain Call, Dance Card, and Grand Finale cards eat vertical space on Picks. Peers should stay available but **collapsed by default**.

## Locked interaction
1. **Default (collapsed):** Own module content only + one shared hop under that content:
   - Copy: `League at a Glance · N managers ›`
   - Identical hop chrome across DC / CC / GF (row height, typography, people icon, chevron).
2. **Open (inline expand):** Tap hop → peer list grows **under that card on the same Picks scroll**. Hop becomes collapse control (`▴`). No scrim, no bottom sheet, no dismiss ×, no card-body swap.
3. **Peer rows:** Same anatomy everywhere — avatar + name + one-line primary summary + chevron. Tap a peer to expand module-specific detail **inside** the list.
4. **Collapse:** Tap hop again (or equivalent) to hide the peer list. Own content never leaves the card.

## Module-specific detail (peer expand only)
| Module | Collapsed peer summary | Expanded detail |
|--------|------------------------|-----------------|
| **Dance Card** | Couple names (compact) + week total if shown | Couples with pts + **Survival & Bonuses** residual line (week total − couple judges pts). Same quieter type as own-card Survival & Bonuses. |
| **Curtain Call** | `Home: X · High: Y` | Expanded Home / High prompt fields (labels only post-lock; no peer pts/grading unless Results published). |
| **Grand Finale** | `Next elim: …` only | Condensed full bracket (existing graded/next-elim language). |

## Gates (unchanged)
- **Curtain Call / Grand Finale peers:** post-lock only. Pre-lock = own card only; **do not show the hop** before lock.
- **Dance Card:** hop available when peer browse is allowed (existing Picks glance rules). Keep **See Everyone’s Dance Cards →** as Standings hop below the league block (or below the hop when collapsed). Do **not** invent Standings-style peer boards on Picks for CC/GF.

## Do not ship
- Bottom sheet / Score History–style overlay for this feature (sheet stays **Score History** only).
- Card-swap body replacement.
- Native `<select>` / dropdown for the league list.
- Always-open peer dump as the default.

## Visual refs (box / design pack)
Folder: `docs` candidate or local `/workspace/mirrorball-league-expand/`

| File | Use as |
|------|--------|
| `dc-compact.png` / `cc-compact.png` / `gf-compact.png` | Collapsed hop (ship default) |
| `dc-inline-open.png` / `cc-inline-open.png` / `gf-inline-open.png` | **Primary open states** |
| `compare-inline-vs-sheet.png` | Context only — sheet is **not** the ship direction |
| `NOTES-alt.md` | Pattern A = locked; Pattern B / sheet = rejected for this feature |

## Related polish (Dance Card, already leaned)
- Season header: `N pts this season` (not spelled-out “points”).
- Own-card **Survival & Bonuses** slightly smaller type.
- Expanded peer DC rows also get Survival & Bonuses for total reconciliation.

## Acceptance checks
- [ ] Collapsed: no peer rows visible; one shared hop on DC, CC (post-lock), GF (post-lock).
- [ ] Open: peers appear under the same card; page is still main Picks scroll (no modal).
- [ ] Hop chrome/copy identical across modules; only peer row content differs.
- [ ] DC expanded peer shows Survival & Bonuses; couple pts + residual reconciles to week total.
- [ ] CC/GF hop hidden pre-lock.
- [ ] See Everyone’s Dance Cards → still present on DC; no new CC/GF Standings peer boards.

## Out of scope
- Standings Dance Card layout changes (condensed cards / Score History sheet are separate briefs).
- Rebuilding Score History.
