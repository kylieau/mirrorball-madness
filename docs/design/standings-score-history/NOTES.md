# Standings — Past Activity / Score History

**Surface:** Per-manager individual Score History on Rank Standings (viewer + peer-inspect).  
**Not** a league-wide activity stream. **Not** Points-by-Module cell expand. **Not** the rejected C1/C2/C3 leaderboard-expand / rules-sheet pack.

## Concept one-liners

- **A Chronological:** Season-start → now feed of contributing “+X from Y” events, mixed modules, week dividers, optional running total — answers “how did my (or their) points accumulate over time?”
- **B By Module:** Same events bucketed under Curtain Call / Dance Card / Grand Finale with module total chips — answers “where did this manager’s points come from?” without chronology.

Both variants ship viewer-only and peer-inspect (selected manager’s history only).

## Mix — Chronological + Module Filters (locked)

- **Mix Chrono+Filters:** Same per-manager chronological Score History as A, plus horizontal chips **All | Curtain Call | Dance Card | Grand Finale**. Filtering hides other modules’ rows and omits empty week dividers. Per-manager only. Zeros hidden. Full manager scoring.

### Mix v2 (Kylie feedback — locked direction + revisions)

Locked direction she likes: chronological feed + module filter chips. Revisions:

1. **Reverse chronology** — Most recent week first (Week 5 → … → Week 1). Within a week, events stay in occurrence order.
2. **Sticky totals bar** — Pinned under the filter chips (elevation/shadow). Shows **actual totals for the active filter**:
   - All → Season total (e.g. 84.20 pts) + optional CC/DC/GF mini-totals
   - Module chip → that module’s season total (e.g. Dance Card 42.30)
3. **Length / product fit** — Full-page-tall history is wrong for product. Prefer a **bottom sheet / full-screen history** for the complete feed (especially peer inspect). Inline fixed-height card only if max-height + nested scroll is acceptable.

#### Product recommendation

| Pattern | When |
|---|---|
| **Sheet (recommended)** | Full Score History (viewer “see all” or tap peer on LB). Standings stays dimmed behind. |
| **Inline scroll** | Only if history must stay on the Standings page: ~420–480px card, filters + sticky totals pinned in-card, feed scrolls inside with bottom fade. |
| Full-page expand | Reference / content completeness only — not product chrome. |

### Delivered (Mix v2)

- `mix-v2-all-viewer.png` / `.html` — viewer · All · reverse chrono · sticky season total + minis
- `mix-v2-dc-filter-viewer.png` / `.html` — viewer · Dance Card filter · sticky DC 42.30
- `mix-v2-all-peer.png` / `.html` — peer Kellie · All · reverse chrono · sticky
- `mix-v2-cc-filter-peer.png` / `.html` — peer Kellie · Curtain Call · sticky CC 32.10
- `mix-v2-inline-scroll-viewer.png` / `.html` — viewer · fixed-height Score History card under LB (~456px) · internal scroll · sticky chips/totals · fade + scroll hint
- `mix-v2-sheet-peer.png` / `.html` — tap peer → bottom sheet (Kellie) · chips + sticky + reverse chrono · Standings dimmed behind

Legacy mix (pre-v2) left on disk for comparison: `mix-all-viewer`, `mix-dc-filter-viewer`, `mix-all-peer`, `mix-cc-filter-peer`.

## Content rules

| Rule | Detail |
|---|---|
| Scope | **One manager at a time** (you or selected peer) |
| Scoring coverage | Full: DC judges + survival + placement + bonus; CC Exact picks; GF couple credits |
| Zeros | **Hidden** — no miss rows, no non-contributing couples |
| Copy | Math-forward labels; Title Case; **no** formula explainer |
| Pts | Fantasy points to **2 decimals**; lines show `+X.XX` |
| Placement | History section under rank tiles + compact Leaderboard (not under every LB row) |
| Chronology (Mix v2) | Newest week first; within-week order preserved |
| Totals bar (Mix v2) | Sticky under chips; filter-scoped actual totals (not progressive run alone) |

## Interim defaults (illustrative)

| Default | Value |
|---|---|
| Viewer | Mid-pack · 3rd of 8 · **84.20** · Kylie Au / #supportSWEKylie |
| Peer | Kellie Au · 1st · **98.60** |
| Module tiles order | Curtain Call → Dance Card → Grand Finale |
| You modules | CC **28.50** · DC **42.30** · GF **13.40** |
| Peer modules | CC **32.10** · DC **48.50** · GF **18.00** |
| Through | Week 5 |
| Event sums | Line totals match module chips (±0.01) |

## Delivered (A / B references — do not overwrite)

- `a-chrono-viewer.png` / `.html` — viewer chronological activity + running total
- `a-chrono-peer.png` / `.html` — peer (Kellie) chronological activity
- `b-by-module-viewer.png` / `.html` — viewer history by CC / DC / GF
- `b-by-module-peer.png` / `.html` — peer history by module
