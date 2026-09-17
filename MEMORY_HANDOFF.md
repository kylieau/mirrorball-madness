# Session Handoff

## 1. Current State

Draft PR **#8** (`cursor/spoiler-reveal-popup-cc7e` → `main`): **Home pending-reveal spoiler callout is a popup**, not a `DeadlineStub` ticket. Do not merge from this session. Spoiler-free logic (`src/lib/spoiler-*.ts`) and the Settings toggle are unchanged.

## 2. Changes Made

### Home spoiler pending-reveal popup (this session)

The Home callout for “Spoiler-Free Mode has a published episode you haven’t marked watched” used `DeadlineStub`, so it sat in the same ticket stack as picks-due stubs and next to league cards. Replaced with `SpoilerRevealCallout`:

- Auto-opens a centered **modal** over a dark blurred overlay (curtain→card gradient, gold ring, `EyeOff` icon) so it reads as an interrupt, not another stub.
- Primary CTA still goes to `/this-week` (“Mark as watched”); “Not yet” / X / overlay dismisses the modal.
- An in-flow **gold-glow banner** (not a ticket, not a league `Card`) stays on Home so there’s still a CTA after dismiss. Same destination.

`DialogContent` gained an optional `overlayClassName` so this modal can use a heavier dim than the default `bg-black/10` without changing every other dialog.

**Verification:** `npm run lint` clean, `npm test` 99/99, `npx tsc --noEmit` + `npm run build` green. Phone-width visual pass (Chrome device mode, iPhone 14 Pro Max ~430×932, close to the requested 390px) against a local unauthenticated fixture of `HomeDashboard` with `pendingReveal` + a deadline stub + a league card — popup auto-opens as a gold-ring modal over a dark overlay; **Not yet** leaves a gold-glow banner that does not look like the burgundy ticket or the league card; both CTAs go to `/this-week` (login redirect here because the fixture isn’t signed in). Fixture route was not committed. **Not exercised:** a real signed-in spoiler-free account against live Season 35 data (this container has no Supabase credentials) — that’s the Vercel preview click-path in PR #8.

**Left alone on purpose:** Settings spoiler toggle, `src/lib/spoiler-*.ts`, This Week’s pending-reveal teaser, A2HS (still Settings-only; not re-added to Home).

## 3. Key Decisions & Lessons Learned

- Old Home A2HS notice (`cursor/add-to-home-screen-notice-c69a`, commit `f211be8`) was a collapsed `Card` accordion — useful as “put it at the top of Home,” not as the popup language. Recast’s gold-border card + sheet is closer, but spoiler needed a true overlay so it can’t be mistaken for a deadline ticket.
- Re-opens on every Home visit while the reveal is still pending (state is just `useState(true)`). Dismiss is per mount, not persisted — the unpublished-to-user episode is still the thing they need to deal with.
- Don’t put API keys in the handoff; this container still has no `.env.local`.

## 4. Backlog & Deferred Items

- Carry-forward from prior handoff: Recast/waivers spoiler framing; `/notifications` `rankBadge` unfiltered-sum leak; roster-eliminated-couple clamp once Season 35 has a real elimination; feature-announcement mechanism.
- Live spoiler-free account pass on the Vercel preview still owed: spoiler-free on + a completed episode past the viewer’s `last_watched_week`.

## 5. Next Steps

1. Review draft PR #8 on a phone-width Vercel preview with a real spoiler-free account; merge only after that visual check.
2. Concurrent `main` activity is still a thing — `git fetch origin main` before assuming this branch’s base is current.
