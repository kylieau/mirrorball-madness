# Live-air prompt · ET vs PT unlock

UX mocks for **Mirrorball Madness** (Mock Mosaic / Kylie Au). Locked **live-air prompt** — sheet over Home during an active East or West air window. Soft inset Pattern B chrome · ~390×844 phones.

## String locks

### KYLIED LOCK (intentionally changed from coded)
| Surface | Lock |
|---------|------|
| **Title** | **Scores are going live** (not coded “Scores Have Started Posting”) |
| **(i) card title** | **About “live”** |
| **(i) body** | “Live” means Site Admin is posting: drafts during East air, published scores on the Pacific feed (live West or delayed). / Scores stay gated until you tap Stay Updated or Mark Watched — either one also marks earlier weeks watched. |

### KEEP (coded / prior revise)
| Surface | Source | Locked strings |
|---------|--------|----------------|
| Prompt helper | `live-scores-prompt.tsx` @ 51ffb9f | **Week N judges' scores are going up. Follow live, catch up fully, or stay blind.** |
| Primary | same | **Stay Updated — I'm Watching Live** |
| Secondary | same | **Mark Watched — I've Finished It** |
| Ghost | same | **Dismiss** |
| SF strip posting | `spoiler-free-strip.tsx` | **Spoiler-Free · Week N posting live** + **Mark Watched** |
| SF toggle on prompt | `spoiler-mode-toggle.tsx` (Settings) | **Spoiler-Free Mode** / **Hide results until you mark a week as watched** |

### Product unlock (subtext under buttons only) — Super early
- ET Stay Updated → **Unlocks draft scores as Site Admin enters them**
- PT Stay Updated → **Shows published scores as they post** (no “· no drafts”)
- Mark Watched (either) → **Unlocks drafts · you’re caught up**
- Helper line-broken · (i) trailing title (placement A) on revised phones
- Drafts never by default / never SF-off alone
- Prompt only during East or West air (not before curtain / ET→PT gap / after night)
- Centered **Live Now · East · 8pm ET** / **Live Now · West · 8pm PT** chip (time included — discussed lean)

## When the prompt shows

| Shows | Does **not** show |
|-------|-------------------|
| East Coast air | Before curtain |
| West Coast / Pacific feed air | ET→PT gap (~7–8pm PT) |
| | After the night is done |

**Anyone** who opens the app during that window — Spoiler-Free **on or off**. Require a choice before live scores show.

## Surfaces

| | File | What |
|---|------|------|
| **Board** | `board.html` · `pngs/01-live-air-board.png` | ET + PT + (i) · when tags · unlock matrix |
| **A** | `02-et-air-prompt.html` · `pngs/02-et-air-prompt.png` | East air · Stay Updated → drafts |
| **B** | `03-pt-air-prompt.html` · `pngs/03-pt-air-prompt.png` | West air · Stay Updated → published as they post |
| **C** | `04-info-open.html` · `pngs/04-info-open.png` | (i) About “live” open |
| **Compare** | `copy-compare.html` · `pngs/05-copy-compare.png` | OLD\|NEW pairs: prod sheet↔ET, prod sheet↔PT, prod (i)↔revised (i) |
| **(i) place** | `06-i-placement.html` · `pngs/06-i-placement.png` | A–D (i) placement on PT sheet · helper line-broken |
| **Unlock copy** | `07-unlock-subtext.html` · `pngs/07-unlock-subtext.png` | Stay Updated ET\|PT ×4 + Mark Watched ×4 |
| **Implement** | `08-implement-steps.html` · `pngs/08-implement-steps.png` | Stepped implement-everything · prod → full ET + PT |

## Prod stills
Push Pilot **390×844** stills (from `mirrorball-live-air-current/`):
- `refs/prod-live-scores-prompt-sheet-390.png` — prompt sheet
- `refs/prod-live-scores-info-open-390.png` — (i) dialog open

Compare board (`copy-compare.html` / `05-copy-compare.png`): three horizontal **OLD | NEW** pairs — (1) prod sheet | revised ET, (2) prod sheet | revised PT, (3) prod (i) | revised (i). Older archived stills remain in `refs/` but are not on the board.

## Design notes
- Soft inset Pattern B sticky (wordmark + SF strip under branding)
- Sheet over Home (curtain etiquette behind, dimmed until choice)
- Coast unlock hints under Stay Updated / Mark Watched only
- PT phone shows SF toggle **off** to underline SF-off mid-air gate
- Dark ballroom · gold accents · Playfair titles · Inter UI · no Lorem

## Regen PNGs

```bash
cd /workspace/mirrorball-live-air-prompt && node screenshot.mjs
```

Uses playwright-core + `/usr/bin/google-chrome`, `deviceScaleFactor: 2`.


## Iterate boards (this pass)

### Board 1 — (i) placement (`06-i-placement`)
Same **PT / West Coast** sheet on A–D so placement is the only variable.
Title: **Scores are going live** (sentence case).
Helper always line-broken:
```
Week 3 judges' scores are going up.
Follow live, catch up fully, or stay blind.
```
| | Placement |
|---|-----------|
| **A** | (i) trailing the title |
| **B** | (i) own row under helper, right-aligned |
| **C** | (i) inline after Live Now chip |
| **D** | (i) end of helper · current |

### Board 2 — Unlock subtext (`07-unlock-subtext`)
Mini button stacks · readable at a glance.

**Stay Updated** (ET | PT pair each):
1. Super early — ET: Unlocks draft scores as Site Admin enters them · PT: Shows published scores as they post  *(no “· no drafts”)*
2. Short — ET: Unlocks draft scores only · PT: Published scores · no drafts
3. Module-plain — ET: Draft scores (East air) · PT: Published scores only
4. Verb-led — ET: Follow drafts as they’re entered · PT: Follow published scores · no drafts

**Mark Watched** (either coast):
1. Super early — Unlocks drafts · you’re caught up
2. Short — Unlocks drafts · caught up
3. Caught-up first — You’re caught up · unlocks drafts
4. Minimal — Unlocks drafts

Prior mocks used Stay Updated #2 Short + Mark Watched #2 Short as the working pair.


### Board 3 — Implement everything (`08-implement-steps`)
Progressive steps from prod 390 still → full locked sheets. Each phone adds one delta.

| Step | Delta |
|------|-------|
| **0** | Prod baseline (`refs/prod-live-scores-prompt-sheet-390.png`) |
| **1** | Title → **Scores are going live** · buttons drop (PT)/(ET) |
| **2** | Helper line-broken · (i) placement A (trailing title) |
| **3** | Centered Live Now chip + time (`East · 8pm ET` / `West · 8pm PT`) |
| **4** | SF Mode toggle on sheet (Settings wording) |
| **5** | Full **ET** · Super early unlock subtext |
| **6** | Full **PT** · Super early unlock subtext (published as they post) |

Full finals also regenerated on `02-et-air-prompt` / `03-pt-air-prompt` (and chip time synced on board / compare / (i) / info).

## Hand-off
Ready for Kylie sign-off → eng / Push Pilot. Pack is self-contained under `/workspace/mirrorball-live-air-prompt/`.


## GLOBAL RULES (every remock — do not re-ask)
- Title: **Scores Are Going Live**
- Prompt chip: **Live Now · East Coast** / **Live Now · West Coast** (no clock)
- Curtain: **Live Now (ET)** / **Live Now (PT)**
- Soft Follow-along CTA subtext; no Site Admin on CTA lines
- Stay Updated subtext: **same muted color as Mark Watched** (never gold)
