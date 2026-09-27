# GF late-entry commissioner flow — UX mocks

UX mocks for **Mirrorball Madness** (designer Mock Mosaic / Kylie Au). Grand Finale late-entry unlock for commissioners after the GF deadline.

Committed in this repo at `docs/design/gf-late-entry/`.

## Locked from Kylie (2026-09-27)

| Surface | Lock |
|---------|------|
| **A · League settings** | IA locked: **Members**, then **Scoring by module** (Curtain Call, Dance Card, Grand Finale with **Missed the lock**). Keep largely as-is. |
| **B · Allow late sheet** | Replace % chips with a **free percent control**: **slider** (0–100%, default 100) **and** editable **% number field**, kept in sync. Two states: 100% and 50% (+ resolved warning + opt-in). Keep Score History helper (× 1.0 / × 0.5 late). |
| **C · Misser late submit** | **Skip for eng** — not a separate surface. Same GF bracket pick sheet + late banner; no new mechanism. File kept for pack completeness (reference only). |
| **D · Score History** | Layout locked as-is with **× 0.5 late** suffix on GF lines when &lt; 100%. Keep full-credit callout. **Kylie correction: D unchanged.** |

Still: one misser · one-shot · commissioner/super-admin · resolved-couples warning + opt-in (no hard block). Backend factor 0–1; never lead the control with “late factor 0–1”.

## Screens (~390 phone)

| # | Screen | What |
|---|--------|------|
| **A** | League settings · Missed the lock | Members → Scoring by module · GF card · quiet misser · **Allow late…** |
| **B** | Bottom sheet · confirm | Manager · **slider + % field** · Score History helper · if resolving → warning + opt-in |
| **C** | Misser bracket (reference) | Same GF sheet + **Late entry · 50% of Grand Finale** banner · **not a separate eng surface** |
| **D** | Score History | Layout locked as-is with **× 0.5 late** suffix when &lt; 100% |

B is delivered twice: default **100%** and **50% + resolved warning** (board leads with the 50% state).

## Deliverables

| File | What |
|------|------|
| `pngs/01-gf-late-entry-board.png` | Board A–D |
| `pngs/02-a-settings-missed-lock.png` | A · settings unlock |
| `pngs/03-b-sheet-100.png` | B · default 100% · slider + field |
| `pngs/04-b-sheet-50-warning.png` | B · 50% · slider + field · warning + opt-in |
| `pngs/05-c-bracket-late-entry.png` | C · reference only |
| `pngs/06-d-score-history-late.png` | D · GF lines with × 0.5 late suffix |

## Regen

```bash
cd /workspace/mirrorball-gf-late-entry-ux
node screenshot.mjs   # Playwright Chromium @2x
```

Phone frame ~390×844 logical. Dark ballroom · gold accents. No couple names (Couple A… placeholders). No git / no messaging Pilot.
