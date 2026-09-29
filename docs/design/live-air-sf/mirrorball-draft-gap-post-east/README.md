# Post–East draft opt-in · Option A (recommended)

**Mock Mosaic · Mirrorball Madness · visuals only (no eng)**  
**For:** Kylie Au

Light compare board for the post–East draft gap: after East air ends, drafts may still exist but the live-air prompt is gone. Stay Updated was mid-East only. Especially SF-off users had no Soft inset path to drafts.

## Option A — Post–East Follow-drafts Home strip (SF-agnostic)

### When
- East air **ended**
- Site Admin still in **draft** state
- User has **not** Stay Updated and **not** Mark Watched
- Until: West air starts **or** published scores replace drafts (or user Follows along / Marks Watched)

### What
- Soft inset under sticky branding (same **Pattern B** placement as SF strip)
- Copy: **Draft scores available** · Follow along
- CTA: **Follow along** → same unlock as mid-East Stay Updated → drafts + amber **Draft scores · may change** strip replaces this (don’t stack)

### SF rules
| Mode | Behavior |
|------|----------|
| **SF on** | This strip **replaces** the SF posting strip for the gap window (don’t stack). After Follow along → amber draft strip. |
| **SF off** | This strip is the Home surface that closes the gap (SF-off had nothing). |

### Lock (unchanged)
Mid-East **Mark Watched stays gray** during East air until episode completes. This strip only appears **after** East air ends. Do not reopen the mid-East gray lock.

## Board

| PNG | HTML |
|-----|------|
| `pngs/01-option-a-strip.png` | `boards/01-option-a-strip.html` |

Two phones (~390×844):
- **LEFT** — SF on · gap window
- **RIGHT** — SF off · gap window (same strip = the fix)

## Options B / C
Prose-only in chat / `PROPOSAL.md` — not visualized in this pack.

## Regen

```bash
cd /workspace/mirrorball-draft-gap-post-east && node screenshot.mjs
```

Playwright-core + `/usr/bin/google-chrome`, `deviceScaleFactor: 2`.

## Absolute PNG path

`/workspace/mirrorball-draft-gap-post-east/pngs/01-option-a-strip.png`
