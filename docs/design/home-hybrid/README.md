# Home · hybrid decision table

Committed at `docs/design/home-hybrid/`. UX mocks, not production UI.

UX lock for **Mirrorball Madness** (Kylie Au, 2026-09-28): the full Home hybrid matrix — one vs many leagues × picks due vs caught up. The earlier one-league phone is in `docs/design/home-hybrid-one-league/`; case A here is the lock for that screen.

`shared.css` is the vendored mark-watched token sheet (the same file the other design packs commit).

## Decision table

| Case | Label | Home shows | Manage › | Gear on Home card | Notes |
|------|-------|------------|----------|-------------------|-------|
| **1 league · picks due** | A | Full hybrid (due) | Hidden | Yes, gear right | Your Leagues; Create/Join quiet; no thin Make picks card |
| **1 league · caught up** | B | Full hybrid (caught up: no Picks Due / Caught up pill; module lines done; Make Picks muted/disabled; Open Standings primary-ish) | Hidden | Yes | Same chrome |
| **2+ leagues · picks due** | C | Stacked hybrids (2–3 cards); at least one due | Show Manage › | Yes on each | Section Your Leagues + Manage › |
| **2+ leagues · all caught up** | D | Stacked hybrids, all quiet/caught | Manage › | Yes | |

**IA locks**

- Section title **Your Leagues** (never “Leagues This Week”)
- Pattern B sticky: wordmark + avatar; SF strip omitted when caught up on watching
- SF sticky strip is **independent** of league hybrid state (see board callout / soft-inset demo)
- Hybrid card + gear-right (lean R from `07-gear-on-cta-row`)
- League names: `#supportSWEKylie`, Carrie Ann's Biggest Fans, Pen & Paso (Doble)

## Deliverables

| Path | What |
|------|------|
| `01-one-due.html` | A · 1 league · picks due |
| `02-one-caught.html` | B · 1 league · caught up |
| `03-multi-due.html` | C · 2+ leagues · picks due |
| `04-multi-caught.html` | D · 2+ leagues · all caught up |
| `board.html` | 2×2 comparison board labeled A–D + SF independence callout |
| `pngs/01-one-due.png` … `04-multi-caught.png` | Individual phone screenshots (@2x) |
| `pngs/board.png` | Board screenshot (@2x) |
| `hybrid-home.css` | Hybrid / dual-cta / gear / stack (from one-league + tweaks) |
| `phone-common.css` | Pattern B sticky + soft-inset SF (from sf-strip-styles) |
| `shared.css` | Vendored mark-watched tokens |

## Regen

```bash
node screenshot.mjs
```

Phone frame ~390×844 logical. No git / no Push Pilot.
