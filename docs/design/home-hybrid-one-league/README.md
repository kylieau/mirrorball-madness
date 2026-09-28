# One league · hybrid on Home

Committed at `docs/design/home-hybrid-one-league/`. Earlier single-case mock. The locked matrix is `docs/design/home-hybrid/` (cases A–D, 2026-09-28). Case A there is the ship screen for one league with picks due; this folder stays so the earlier phone can be rebuilt.

`shared.css` is the vendored mark-watched token sheet (the same file the other design packs commit).

UX lock for **Mirrorball Madness** (Kylie Au): when the user has **one league**, put the full **hybrid league card** on **Home** — no separate Manage surface, no thin “Make picks” ticket above the section.

## Lock

| Rule | Detail |
|------|--------|
| One league → full hybrid on Home | Due-state card with module stack + dual CTA |
| No Manage › | Section is **Your Leagues** only (not “Leagues This Week”) |
| Gear on CTA row (right) | Make Picks \| Open Standings \| gear (`aria-label="League settings"`) — lean R |
| No duplicate Make picks card | Omit thin `#supportSWEKylie / Make picks ›` above the section; hybrid replaces it |
| SF strip | Omitted here — user is caught up on watching (strip only for action states); sticky wordmark + avatar remain |

## Deliverables

| File | What |
|------|------|
| `01-one-league-home.html` | Full 390×844 phone mock |
| `pngs/01-one-league-home.png` | Screenshot of `#shot` (@2x) |
| `hybrid-home.css` | Hybrid card / mod-stack / dual-cta / gear styles |
| `phone-common.css` | Pattern B sticky chrome (from sf-strip-styles) |
| `shared.css` | Vendored mark-watched tokens + curtain / nav |

## Regen

```bash
node screenshot.mjs
```

Phone frame ~390×844 logical. No git / no Push Pilot.
