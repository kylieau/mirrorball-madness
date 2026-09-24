# Mirrorball Madness — Standings Score History + Dance Cards
## Implementation brief for Claude Code (product + UX lock)
**Date:** 2026-09-23  
**Owner (design):** Mock Mosaic / Kylie Au  
**App surface:** League **Standings** (rank leaderboard), not Picks-only flows  

Hand this file to Claude Code **with the primary mock PNGs** listed in §7.

---

## 1. Problem

Managers cannot tell **what actually contributed** to a manager’s season total. Live Standings shows rank, module aggregates, and Dance Card rosters (judges couple chips), but not the full contribution math (survival, podium, Curtain Call picks, Grand Finale credits, etc.).

**Not the problem:** teaching how the scoring *formula/settings* work (rules sheets, explainer captions).

---

## 2. Rejected directions (do not build)

Earlier Standings “points breakdown” concepts were rejected:

| Rejected | Why |
|---|---|
| Explainer tiles + rules bottom sheets | Felt like formula lecture, not contribution math |
| Expandable leaderboard rows with module splits | Extra info under LB; wrong place |
| Weekly “How Your Points Add Up” ledger as rules/tally UI | Wrong framing |
| Season rollup lines expanding **under Points by Module cells** | Superseded by past-activity history |
| Showing **0-pt** miss / non-contributing lines | Noise; hide zeros |
| League-wide activity stream | Out of scope — **per-manager history only** |

Legacy mocks in `/workspace/mirrorball-standings-breakdown/` (c1/c2/c3/hybrid) are **shelved**.

---

## 3. Locked product direction

### 3.1 Score History (primary new UI)

**Pattern:** Chronological **past activity** feed of contributing events: “+X derived from Y”.

**Mix (locked):**
- Chronological feed
- Module filter chips: **All | Curtain Call | Dance Card | Grand Finale**
- **Newest week first** (Week N → … → Week 1)
- **Sticky totals bar** under filters:
  - **All** → season total + mini CC/DC/GF totals
  - Module chip → that module’s total (run column = filtered module run)
- **Hide all 0-pt lines**
- Include **full manager scoring**, not judges-only:
  - Dance Card: judges × multiplier, survival, placement/podium, episode bonuses
  - Curtain Call: scoring picks only (Exact / whatever awarded pts)
  - Grand Finale: couple credits when position becomes known
- Fantasy points **2 decimal places**; Title Case labels; math-forward copy (e.g. `Judges 38 × 0.15`), almost no rules prose
- **Per-manager only:** viewer’s history by default; **tap a leaderboard row** to inspect that peer’s history
- **No league-wide feed**

**Container (locked 2026-09-23):** **Bottom sheet / secondary view** opened from the leaderboard (not an endlessly long inline section on Standings).  
Optional alternate explored: fixed-height inline card with nested scroll — **not preferred** once sheet was chosen.

**Suggested affordance:** chevron or “Score History ›” on leaderboard rows (including “you”).

### 3.2 Standings page composition (with Score History)

Recommended stack:
1. Rank hero + viewer module tiles (existing)
2. Leaderboard (tap row → Score History sheet)
3. **Condensed** League Dance Cards (existing peer browse, tighter)
4. (Live may also show Points by Module table — keep aggregates; do **not** use PBM as the home for contribution lines)

### 3.3 Dance Cards on Standings (locked note — no new mock required)

- **Keep** Dance Card roster cards on Standings (always-open peer browse with **per-couple totals** under each manager).
- **Condense** them (tighter rows / less vertical chrome) so they coexist with Score History entry points.
- **Do not remove** them just because Picks also has rosters / “See Everyone’s Dance Cards”.
- **Do not replace** roster couple chips with Score History lines — different questions:
  - Rosters ≈ who owns whom + **judges** couple display
  - History ≈ full manager contribution events over time

**Related IA (already locked earlier):**
- Curtain Call **peer** picks: **Picks tab only** (not Standings)
- Season Bracket / Grand Finale **peer** brackets: **Picks tab only**
- Picks: own Dance Card + lighter glance / hop to Standings for full peer cards

Reference mocks for current Dance Card dual placement:  
`/workspace/mirrorball-finale-mocks/14-standings-dancecards-live.png`  
`/workspace/mirrorball-finale-mocks/15-picks-dancecard-glance.png`

---

## 4. Engineering constraints (Push Pilot — do not invent a ledger API)

Source of truth for implementation notes (2026-09-23):

- **No stored contribution ledger.** Reconstruct lines from scoring helpers + source tables when results publish.
- Cache today: `weekly_manager_scores` per `(league_id, manager_id, week_id)` → `roster_points`, `prediction_points`, `grand_finale_points`, `total_points` (weights applied on totals).
- Season Standings = sum of those rows (spoiler-filtered).

**Natural grain (nonzero only in UI):**

| Module | Line grain | Notes |
|---|---|---|
| Dance Card (`roster_points`) | rostered **couple × competition week** | Parts: judges (`dance_scores` × multiplier), survival, placement 1–5, `bonus_points` (+ optional note). League roster UI shows **judges-only** — do not treat roster chips as full DC contribution. |
| Curtain Call (`prediction_points`) | **pick × week** (elim, top-scorer) | Same classifiers as Past Picks. Peer picks: RLS **post-`prediction_lock_at`**. |
| Grand Finale (`grand_finale_points`) | **predicted couple**, credited **once** when actual position first known | Peer brackets: RLS **post-`effective_grand_finale_deadline`**. |

**Rounding:** float math; `Math.round` at manager × week × module when writing weekly scores. Line sums may drift ±1 vs stored module total — treat **stored/weighted module (and season) totals as authoritative** in the sticky bar; don’t invent an “other” bucket.

**Category weights:** applied on season module aggregates (`*_category_weight`). Apply consistently when showing season vs module totals.

**Spoilers:** only weeks/episodes in viewer `cutoff.allowedEpisodeIds`.

**Closest existing UI shape:** Curtain Call Past Picks rows (viewer, one week) — reuse patterns, not Standings LB expand.

---

## 5. Copy / UX details

- Labels: Title Case
- Event rows: `+X.XX` pts; optional running total column (season when All; module run when filtered)
- Empty weeks: omit week divider when filter leaves no events
- Peer Curtain Call before lock: gate / empty state (not fake picks)
- Illustrative numbers in mocks are **not** production truth (commissioner-configurable settings)

---

## 6. Out of scope for this brief

- Formal scoring-rules education UI
- Logo / Lotus brand work
- Implementing Curtain Call or GF peer UIs on Standings
- Persisted line-item ledger table (unless eng later chooses to add one)

---

## 7. Primary mocks to attach for Claude Code

### Ship against these (Score History v2)

| File | What it shows |
|---|---|
| `mix-v2-sheet-peer.png` | **Preferred container:** tap peer → Score History **sheet** (newest first, chips, sticky totals) |
| `mix-v2-all-viewer.png` | Full feed content reference: All filter, reverse chrono, sticky season total |
| `mix-v2-dc-filter-viewer.png` | Dance Card filter + sticky module total |
| `mix-v2-cc-filter-peer.png` | Peer + Curtain Call filter |
| `mix-v2-all-peer.png` | Peer All feed (full capture) |
| `mix-v2-inline-scroll-viewer.png` | **Not preferred** — only if reopening inline debate; fixed-height nested scroll |

Path prefix: `/workspace/mirrorball-contrib-math/`

### Exploration / do not implement as final

- `a-chrono-*.png`, `b-by-module-*.png` — early A/B
- `mix-all-*.png`, `mix-dc-filter-viewer.png`, `mix-cc-filter-peer.png` — mix v1 (oldest-first, no sticky bar)
- `/workspace/mirrorball-standings-breakdown/*` — rejected breakdown pack

### Dance Cards (condense existing; no new mock)

- `../mirrorball-finale-mocks/14-standings-dancecards-live.png` — current Standings Dance Cards target to **tighten**
- `../mirrorball-finale-mocks/15-picks-dancecard-glance.png` — Picks stays lighter

Also see `NOTES.md` in this folder for mock-internal notes.

---

## 8. Acceptance checklist for Claude Code

- [ ] Score History opens from leaderboard row (sheet/secondary), per selected manager
- [ ] Filters: All / Curtain Call / Dance Card / Grand Finale
- [ ] Newest week first; sticky totals match active filter
- [ ] Only nonzero contribution lines; full DC/CC/GF manager scoring grains above
- [ ] Honor spoiler cutoff + CC/GF peer lock/deadline gates
- [ ] No rules-explainer sheets as the main UX
- [ ] Standings Dance Cards remain, **condensed**; not removed; not replaced by history
- [ ] Curtain Call / GF peer UIs stay off Standings (Picks)
- [ ] Totals in sticky bar match authoritative season/module aggregates (accept minor line rounding drift)

---

## 9. One-paragraph summary (pasteable)

Build a per-manager **Score History** on Standings: a chronological activity feed of nonzero point events (Dance Card couple-week parts including survival/podium/bonus, Curtain Call scoring picks, Grand Finale couple credits), with module filters (All / CC / DC / GF), newest week first, and a sticky totals bar. Open it from a **leaderboard row tap** into a **sheet** (peer-inspect included). Reconstruct lines from existing scoring helpers — no ledger API. Keep condensed Dance Card roster cards on Standings for who-owns-whom + judges couple pts; do not put Curtain Call/GF peers on Standings. Ignore the older points-breakdown mocks under `mirrorball-standings-breakdown/`.

---

*End of brief.*
