# Mirrorball Home / Your Leagues — design pack

**Locked:** 2026-09-24 (Kylie)

Open this folder. Read [`00-LOCKED.md`](./00-LOCKED.md) first. Use [`CLAUDE-CODE-PLAN-PROMPT.md`](./CLAUDE-CODE-PLAN-PROMPT.md) as the paste-ready plan prompt: copy everything below its horizontal rule into Claude Code. **Plan first — do not implement until Kylie says.**

PNGs under `pngs/` are the mocks. `ref-live-home.png` is the live Home baseline before this change. HTML under `html/` is the editable mock source.

These are design mocks, not production UI.

## Locked lean

- Curtain leads with status copy; week rail secondary
- Home league rows stay compact (no accordion)
- Richer triage + optional expand on See All
- Need-based tap: Picks Due → Picks, else Standings

## Files

| Path | Role |
|------|------|
| `00-LOCKED.md` | Locked decisions + curtain state table — read first |
| `CLAUDE-CODE-PLAN-PROMPT.md` | Paste-ready plan prompt (plan only) |
| `pngs/01-curtain-status.png` | Home target |
| `pngs/02-leagues-triage.png` | See All triage |
| `pngs/03-leagues-expand.png` | See All expand |
| `pngs/04-tap-destinations.png` | Tap = need-based (C) |
| `ref-live-home.png` | Live baseline before change |
| `html/01-curtain-status.html` | Editable source for the Home mock |
| `html/02-leagues-triage.html` | Editable source for See All triage |
| `html/03-leagues-expand.html` | Editable source for See All expand |
| `html/04-tap-destinations.html` | Editable source for the tap compare |
| `html/shared.css` | Shared mock tokens |
| `html/screenshot.mjs` | Regenerates `pngs/` from the HTML |

## How to open

1. Read `00-LOCKED.md`.
2. Paste `CLAUDE-CODE-PLAN-PROMPT.md` (below the rule) into Claude Code, or point it at `docs/design/home-leagues/`.
3. Attach `pngs/01`–`04` and `ref-live-home.png` if the session cannot see this folder.

Phone frame ~390×844; PNGs exported at 2×.

On Home, the curtain leads with status copy (“Picks open” + local air time). The week rail stays quiet and secondary so progress does not compete with the job. Compact Home rows stay thin. Richer per-league triage (module status, week delta, due CTA) and the optional expand live on See All, where the space earns it. Tap is need-based on both surfaces: Picks Due opens Picks; otherwise the row opens Standings. Skip mute triage lines on Home when every caught-up row would repeat the same filler.
