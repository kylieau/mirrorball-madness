# Mirrorball Madness — West / Pacific live score reveal

High-fidelity mobile mocks (390×844) for **progressive score reveal during the Pacific feed window**. Dark ballroom (deep plum/black, gold accents); Playfair for manager points & big titles, Inter elsewhere.

**Locked with Mock Mosaic · 2026-09-24** — lean system only.

**Design mocks only.** Do not plan or implement app code from this pack until Kylie says so. Cite engineering gaps in `ia/ENG-GAPS.md` (what exists on `main` vs what the mocks assume). Companion locks: `00-LOCKED.md`, paste-ready plan prompt `CLAUDE-CODE-PLAN-PROMPT.md`, handoff index `PACK-FOR-CLAUDE.md`.

**BACKLOG “Follow live on Home” is superseded / won’t-add.** The earlier backlog item “Follow live + Realtime on Home” (per-viewer Follow live toggle, West-feed live strip) will not ship. This lean replaces it. See `BACKLOG.md`.

### Won’t ship (do not add)

Watching-live session, Live strip, Follow live, watching sheet, LIVE chips on leagues. Full cut list below.

## Locked product lean (Kylie + Mosaic)

- **Admin:** one couple at a time on Enter Results (confirm sheet + ~30s undo), then a separate **Publish results** for safe/eliminated. Super-admin only. No standalone Reveal console and no Reveal CTA on player Home.
- **Fantasy:** Dance Card / judges points update **per reveal**; elimination points only on final publish.
- **Copy:** theatrical hero **“West Coast is watching”** (pre-window hero `Pacific feed at 8pm`); hard facts are **Pacific feed** / **8pm PT** (fixed Pacific wall clock, never viewer-local).
- **Viewer:** Spoiler-Free off → scores and Recent Activity fill in as each couple is revealed. Spoiler-Free on → stay hidden until **Mark week watched**. No watching-live session, Live strip, Follow live, or watching sheet.

### Copy split — theatrical vs hard facts

**Theatrical (viewer hero / etiquette):**
- Pre-window (~7–8pm PT): hero `Pacific feed at 8pm` · sub `Spoilers can wait`
- Live window (8–10pm PT): hero **`West Coast is watching`** · sub `Spoilers can wait`
- After 10pm PT still falls back to Results in when appropriate; progressive posting may continue past 10pm.

**Hard facts (chips / clocks / admin ops) = Pacific feed language:**
- Sticky: `Week N · Pacific feed` / `Week N · Pacific feed 8pm` / `Pacific feed on`
- Times: **`8pm PT`** — fixed Pacific wall clock, never viewer-local
- Admin progress: `3 of 8 posted · Pacific feed` (not “West live”)

Do **not** replace the theatrical hero with “Pacific feed is on.” Pacific feed labels clocks, chips, and ops.

### Reveal mechanics

- Admin drafts all scores after East airing; reveals **one couple at a time** during Pacific feed (match broadcast order; not forced FIFO). Confirm sheet + ~30s undo, then separate **Publish results** for safe/elim. Super-admin only.
- Fantasy: Dance Card / judges pts update **per reveal**; elimination-based pts only at final publish.
- **Spoiler-Free is the ONLY standing viewer preference.** No Follow live toggle. No per-dance marks. No third path.
  - **SF OFF** → as each couple is revealed, scores appear on Home. Recent Activity shows score posts (e.g. Ava scored 27). No special prompt/sheet.
  - **SF ON** → stay hidden through progressive reveals until **Mark week watched**. No auto-unlock when reveals start.
- Curtain etiquette for everyone during Pacific/West window — not a separate control.
- **Mark week watched** unchanged — catch-up unlock for SF-on users.

### Admin lives on Enter Results (not a Reveal console, not Home)

Undo + confirm + final publish belong on the existing **Enter Results** admin page.

- Enrich the existing couple score list — do **not** invent a standalone Reveal console.
- Do **not** put a Reveal CTA on player Home.
- Header: Admin chrome · bottom tabs: Enter Results (active) / View Results / Schedule / Settings
- Episode picker, draft / live-reveal / ready-to-publish status
- Progress: `N of M posted · Pacific feed`
- Sticky **Up next** card: couple + score + big `Reveal` (thumb-first while she watches delayed)
- Row badges: **Posted / Ready / Waiting**
- Hint: `Reveal after they’ve danced on your feed`
- Footer: Save draft · **Publish results** gated until dances posted (final publish ends progressive mode)
- Optional quiet Home chip (super-admin only): `N of M posted · Reveal ›` → deep-links to Enter Results. No Reveal button on Home. Skipped in this pack if short on time.

## Won’t ship (cut · Mosaic invented; not necessary)

Agreed cut with Mosaic — only helps a minority watching while admin posts (often &lt; half of league); second mental model not worth it.

**Won’t ship:** watching-live session, Live strip, Follow live, watching sheet, LIVE chips on leagues.

- Watching-live tonight session / night-scoped override
- “I’m watching live now” / Show live scores sheet (watching sheet)
- Live scores strip (special gold-edged feed)
- Watching live · tonight chip / End session
- Just posted pulse as a special live mechanism (normal Activity score posts are fine)
- LIVE chips on Your Leagues rows
- Any third path beside SF on/off + Mark week watched
- Follow live toggle · per-dance “mark dances I’ve seen”
- Reveal button on player Home · standalone Reveal console

## Ops reality (super admin)

- **No DWTS/ABC data feed** — fully manual reveal by super admin.
- Pacific feed often started **~30 min late** (skip commercials, finish on time).
- “Live” here means **progressive posts during/after the Pacific window**, not frame-synced second-screen.
- App should **lag Pacific broadcast, never lead**. Reveals may continue **past the curtain’s 10pm PT**.
- Viewer copy uses “as scores are posted” — avoid “as they dance” sync claims.
- Enter Results is thumb-friendly sequential catch-up (big Reveal CTA, clear Up next).

## Screens

| # | File | What |
|---|------|------|
| 01 | `01-admin-reveal-console.png` | Enter Results · live reveal: Up next + Posted/Ready/Waiting · Pacific feed chip |
| 02 | `02-admin-confirm-reveal.png` | Confirm reveal **sheet on Enter Results** |
| 03 | `03-admin-undo-window.png` | Undo 30s toast + chip on couple row (Enter Results) |
| 04 | `04-admin-publish-results.png` | Publish safe/elim via existing Publish results + confirm (ends progressive) |
| 05 | `05-home-sf-on-hidden.png` | SF on · West Coast is watching · scores hidden · **Mark week watched** available |
| 06 | `06-home-sf-off-progressive.png` | SF off · mid-night · Activity score posts · provisional pts · **no** Live strip / LIVE chips |
| 07 | `07-home-sf-on-still-waiting.png` | SF on · reveals happening (admin) but Home still spoiler-safe · Mark week watched |
| 08 | `08-home-points-live.png` | SF-off provisional pts · serif tick · elim pts pending · no Live/session chip |
| 09 | `09-state-waiting-results.png` | All dances posted · Waiting on safe/elim · no watching-live chrome |
| 10 | `10-state-after-final.png` | Results in · SF-off sees full week · SF-on still needs Mark watched if never did |

HTML sources sit alongside; PNGs in `pngs/`. Regenerate: `node screenshot.mjs`.

Human-facing Order of Operations (SF off vs on): `ia/02-sf-ooo.png` · notes in `ia/OOO-NOTES.md`. Simple narrative: `ia/01-plain-flow.png`. Dense eng maps: Boards A–C (`00-system-map`, `00b-night-timeline`, `00c-eng-gaps`).

## Recommendations

1. **Admin order** — Suggest “Up next” from drafted show order for thumb-first sequential catch-up on Enter Results; still allow picking any Ready/Waiting couple. Reveal only after they’ve danced on *your* (lagged) feed.
2. **Undo 30s** — Soft window only; restores hidden state and rolls back Dance Card / judges pts for followers who already saw the reveal. After 30s, treat as committed (support path for rare corrections).
3. **Spoiler-Free only** — Don’t add Follow-live, night session, or per-dance marks. West Coast hero = etiquette; Pacific feed = hard-fact label; SF = sole standing gate. SF-off auto-sees; SF-on waits for Mark week watched.
4. **Activity, not a Live strip** — Score posts land in normal Recent Activity for SF-off. No special gold live strip / Just-posted pulse mechanism. No LIVE noise on league rows.
5. **Provisional pts** — Tick Dance Card / judges pts per reveal with caption “Elim pts pending.” Apply elim fantasy pts only on final publish; then clear provisional chrome.

## Open questions / edge cases

1. **Late joiner mid-reveal** — SF-off user opens app at dance 5: show 1–5 already posted in Activity, or only new ones going forward?
2. **Admin reveals out of show order** — UI allows it; do we warn, log, or block if order was locked?
3. **SF-on after final publish** — Confirm: they still need Mark watched (mocks assume yes). Any nudge banner?
4. **East-coast users during Pacific window** — They already saw East. Do they sit SF-off by default, or still see the curtain etiquette?
5. **Push notifications** — Push on each reveal for SF-off users? Risk of lock-screen spoilers for shared devices.
6. **Offline catch-up** — Queue reveals client-side when reconnecting SF-off; how to surface “missed” Activity rows?
7. **Final publish before all dances posted** — Override with warning exists in admin; what happens to unposted drafted scores (auto-post then publish, or block)?
8. **Couple not dancing this week** — Hidden from reveal list entirely, or shown as N/A / bye?
9. **Undo after some fans already saw it** — Is 30s rollback acceptable socially, or should undo be admin-only with a “correction” activity line?

## Style

Matches `/workspace/mirrorball-home-leagues-pack/` (shared tokens, curtain, nav, Playfair/Inter). Enter Results chrome matches live admin (`admin-enter-results` / `02-enter-results` refs).
