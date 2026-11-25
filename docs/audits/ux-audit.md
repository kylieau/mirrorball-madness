# UX and UI audit — 2026-10-16

A read-only review of every route and shared component, using the `frontend-design` and `web-design-guidelines` skills (`.claude/skills/`), with CLAUDE.md taking precedence. No app code was changed.

**How it was checked**
- Screenshots of every route at 360px and 390px from a production build. Three viewers were used: the scratch viewer from `scripts/qa-screenshots/seed.mjs`, a throwaway user with no leagues, and a signed-out visitor. Sheets, dialogs and a keyboard Tab pass were opened, but nothing was submitted.
- Grep sweeps against the Web Interface Guidelines rule list.
- Contrast ratios calculated from the real tokens in `globals.css`, with alpha blended onto the actual background.
- A light vs dark OS-appearance comparison using computed styles.
- The live-night chrome (curtain states, Spoiler-Free strips, Scores Are Going Live) came from the same day's fixture dry run; see BACKLOG.md.

**Limits**
- Chromium can't show iOS safe areas, the keyboard or rubber-band scrolling.
- The draft lobby and live draft weren't rendered, because the scratch league's draft is already complete.
- Admin pages were seen only as a commissioner. Enter Results was viewed at its landing state only, since selecting a week can write correction drafts to the real season. Show Settings and Accounts redirect a commissioner, so neither was seen.
- Not rendered: the Curtain Call pick form in its editing state (the scratch viewer already had a saved pick), and Recast with an open slot.
- Every file was grep-swept, but the largest components (`league-modules-form.tsx`, `schedule-manager.tsx`, `results-form.tsx`) were read in sections, not end to end.

Severity:
- **High:** blocks a task, misleads about points or spoilers, or fails accessibility on a core flow.
- **Medium:** noticeable friction or inconsistency on a common path.
- **Low:** polish.

---

## Status (2026-10-18)

**Fixed:**
- **T1:** `Button` has a touch-only 44px hit area; Enter Results' per-couple actions are standard size; empty Manage Leagues shows full-size Create/Join.
- **N3:** the arrow buttons have names.
- **V2:** error text uses `text-danger-text` with `role="alert"`.
- **S1:** branded `not-found.tsx` and `error.tsx`.
- **C2:** every lock and deadline time goes through `formatAirsAt`.
- **V1:** the amber text is a fixed `--amber-text` token, `dark:` always applies and `color-scheme` is dark, so light-mode and dark-mode phones render identically (the dark-mode look was chosen).
- **L1:** long names wrap, and the draft page's back button truncates.
- **C1:** Title Case and "…" pass.
- **A4:** autofill hints.
- **A2, part:** sign-in, sign-up and join buttons show a pending state.
- **A3:** the invite page names the league and team count, flags an unknown code, and blocks joining mid-draft.
- **S2:** League Settings, draft, waivers, Settings, Notifications and Manage Leagues have a loading skeleton. Admin deliberately has none (an instant skeleton would unmount Enter Results and drop a pending autosave).
- **N2:** the fan tab bar is a `Main` nav landmark, the current tab carries `aria-current="page"` (still plain text, so tapping it doesn't reload or drop `?week=`), and on Picks/Standings it comes after the page content.
- **N4:** with Reduce Motion on, animations and transitions finish instantly (pulsing live dots and skeletons stop, sheets appear without sliding).

**Still open:**
- **A1, forgot password:** needs auth email confirmed working on this Supabase project. A cross-device reset also needs a `token_hash` email template.
- **A2, rest:** keeping typed values after an error, and dropping the `?error=` text.
- **A5, V3, V4, T2, T3, N1, C3.**

## Top 10

| # | Issue | Severity | Where |
|---|---|---|---|
| 1 | No way to reset a forgotten password | High | `src/app/login/page.tsx:18` |
| 2 | The phone's light/dark setting changes the app's colors; amber point text drops to 2.3:1 in light mode | High | `src/app/globals.css:64`, `src/components/past-picks-card.tsx:72` |
| 3 | Error messages use a red that fails contrast (3.2–3.4:1) in 52 places, and are never announced | High | `src/app/login/page.tsx:19` and 51 more |
| 4 | Broken links and server errors show a near-invisible black-on-black page with no way back | High | no `not-found.tsx` / `error.tsx` in `src/app` |
| 5 | A failed sign-in or sign-up clears the form; no pending state; error text comes from the URL | Medium | `src/app/auth/actions.ts:24`, `:45` |
| 6 | Key tap targets are 24–28px: account avatar, Create/Join, bracket arrows, Enter Results per-couple buttons | Medium | `src/components/account-settings-sheet.tsx:76` and others |
| 7 | Lock times appear in three formats ("10/20/2026, 8 PM EDT", "Tuesday 8 PM ET", "Locks in 4d 0h") | Medium | `src/lib/use-browser-time-zone.ts:20` |
| 8 | The invite page never names the league, and a bad code looks valid until after sign-up | Medium | `src/app/join/[code]/page.tsx:25` |
| 9 | Settings exists twice, in different orders, with three different close/back patterns | Medium | `src/app/settings/page.tsx:55`, `src/components/account-settings-sheet.tsx:81` |
| 10 | About 20 buttons and titles break the Title Case rule; loading labels use "..." | Low | see C1 |

Details for each are in the sections below (finding IDs in brackets: 1 = A1, 2 = V1, 3 = V2, 4 = S1, 5 = A2, 6 = T1, 7 = C2, 8 = A3, 9 = N1, 10 = C1).

## What already works well

- **Core palette contrast is strong.** Body text is 14.7:1 on the background, gold 7.4:1, muted text 5.1:1 (4.8:1 on cards). The `--danger-text` and `--emerald-text` tokens are both above 9:1.
- **Inputs are 16px on phones** (`text-base`, `ui/input.tsx`), so iOS never zooms in on focus. Zoom isn't disabled, and `theme-color` matches the background.
- **Safe areas are handled** on the tab bar, sticky top chrome and the bracket late-entry sheet. Small strip pills widen their hit area with a `before:` inset.
- **Toggles carry the right ARIA state:** League at a Glance, Score History rows, the bracket expand and the copy-picks chips all expose `aria-expanded` or `aria-pressed`. Most icon buttons have labels, and decorative icons are `aria-hidden`.
- **Destructive actions confirm:** Leave, Remove member, Demote, Delete league, Reset draft and the deletion request all open a confirm dialog. Per-couple Publish has a 30-second undo.
- **Server error messages read as directions,** e.g. "Draft in progress — ask the commissioner to cancel it first" and "Pick both couples going home this week, or leave both blank to skip".
- **The four fan tabs have instant skeletons,** and every viewer-local time is formatted after mount, so there are no hydration flashes.
- **Long names are handled** on Home, Standings and Results through truncation and two-line clamps. The exceptions are in L1.
- **Empty states have personality and a next step,** e.g. "Everyone's tied at zero — the mirrorball is still in the box." A new user who opens Home lands on Manage Leagues with a create/join prompt.
- **Live-night chrome** (curtain, strips, the live prompt and the mark sheets) renders as specified at both widths and in ET and PT.

---

## Findings

### Accounts and onboarding

**A1 · No password reset** — High
- **Where:** `src/app/login/page.tsx:18` (and nothing anywhere in `src` calls `resetPasswordForEmail`).
- **What's wrong:** an email/password user who forgets their password has no self-serve way back in. The sign-in page offers only Google.
- **Why it matters:** they're locked out of their picks and league, possibly right before a lock, and the only recovery is asking a site admin.
- **Fix:** add a "Forgot Password?" link to a page that calls `supabase.auth.resetPasswordForEmail` with a redirect back to an update-password page. The update-password form already exists in Account & Data (`account-data-form.tsx`).

**A2 · Auth errors clear the form, there's no pending state, and error text comes from the URL** — Medium
- **Where:** `src/app/auth/actions.ts:24` and `:45`; `src/app/login/page.tsx:19`; `src/app/sign-up/page.tsx:19`; also `src/app/leagues/actions.ts:18`, `:35`, `:65` and `src/app/leagues/(manage)/page.tsx:81`.
- **What's wrong:**
  - A failed sign-in or sign-up redirects to `?error=`, which empties every field (display name, email, password).
  - The submit button gives no feedback while the request is in flight, so people double-tap.
  - Whatever is in `?error=` is printed verbatim, so any link can put arbitrary text on the sign-in page.
- **Why it matters:** retyping on a phone is the most common reason a sign-up is abandoned. The URL text is a small spoofing vector ("Your account is locked, email …").
- **Fix:** return errors from the action via `useActionState` instead of redirecting, keep the field values, and show "Signing In…" / "Creating Account…" while pending. Show only known error codes mapped to copy, not raw query text.

**A3 · The invite page doesn't say what you're joining** — Medium
- **Where:** `src/app/join/[code]/page.tsx:25–27`.
- **What's wrong:** an invitee sees "You've been invited to a league · Invite Code ABC123" with no league name, commissioner or member count. A mistyped or expired code looks exactly the same. The failure only shows up after they've created an account, as raw RPC text on Manage Leagues.
- **Why it matters:** this is the first screen most new players see, and it doesn't confirm they're in the right place.
- **Fix:** look up the code server-side (a small security-definer RPC that returns only the league name and member count) and show "Join Carrie Ann's League — 3 managers". For an unknown code, say so before sign-up. This is not the declined first-run tips overlay; it only names the league.

**A4 · Auth inputs lack `autoComplete`** — Low
- **Where:** `src/app/login/page.tsx:24` (and the password field below it); `src/app/sign-up/page.tsx:24` and `:33`; `src/components/account-data-form.tsx`. There is no `autoComplete` anywhere in `src`.
- **What's wrong:** password managers and iOS autofill have to guess, and they can't tell a new password from the current one.
- **Why it matters:** autofill is how most phone users sign in. When it misfires, they type a password on a phone keyboard, which is where sign-in typos come from.
- **Fix:** add `autoComplete="email"`, `"current-password"`, `"new-password"` and `"nickname"`, plus `spellCheck={false}` on email and invite-code fields.

**A5 · Sign-in and sign-up pages carry no app identity** — Low
- **Where:** `src/app/login/page.tsx:18`, `src/app/sign-up/page.tsx:18`, `src/components/site-header.tsx`.
- **What's wrong:** a plain sans "Sign in" heading under a text-only header. Every signed-in page opens with the Fraunces title and the gold rule (`PageHeader`); these don't. The mirrorball mark and tagline in `src/config/app.ts` aren't used.
- **Why it matters:** it's the first impression for every invitee, and it reads as a generic template, not the show-night product inside.
- **Fix:** use `PageHeader` styling and add the mark plus `APP.tagline` above the form. No new design is needed; these already exist.

### Visual system and contrast

**V1 · The phone's light/dark setting changes the app's colors** — High
- **Where:** `src/app/globals.css:64`. There's no `@custom-variant dark` and no `color-scheme`, so Tailwind's `dark:` follows `prefers-color-scheme`. Affected:
  - `src/components/pick-em-box.tsx:224` (Double Elimination banner);
  - `src/components/past-picks-card.tsx:72`, `:78`, `:80` (partial-credit verdict and points);
  - `src/components/curtain-call-league-list.tsx:27` (League at a Glance partial points);
  - `src/components/results-form.tsx:1091`, `:1101` (Enter Results notices);
  - plus the `dark:` rules inside `ui/button.tsx`, `ui/input.tsx` and `ui/switch.tsx`.
- **What's wrong:** with the phone in light mode, `text-amber-800` applies, which is 2.3:1 on cards. In dark mode the same text is amber-300. Inputs lose their tinted fill and outline buttons change shade (confirmed by computed styles and a screenshot diff). Native date pickers and scrollbars stay light in both, because `color-scheme` is `normal`.
- **Why it matters:** partial-credit points and the double-elimination warning are close to unreadable for anyone whose phone is in light mode. It also breaks the settled "one fixed look". The design was probably only ever reviewed in one mode.
- **Fix:** add `@custom-variant dark (&:where(:root, :root *));` and `color-scheme: dark` on `:root` in `globals.css`, so the dark styles always apply. Better still, replace the `text-amber-800 dark:text-amber-300` pairs with one token (e.g. `--partial-text`).

**V2 · Error text fails contrast and isn't announced** — High
- **Where:** 52 uses of `text-destructive` for text in `src/app` and `src/components`, e.g. `src/app/login/page.tsx:19`, `src/components/pick-em-box.tsx:228`, `src/app/leagues/(manage)/page.tsx:81`. `--danger-text` is used once.
- **What's wrong:**
  - `#a9524f` is 3.4:1 on the background and 3.2:1 on cards; AA for small text needs 4.5:1.
  - None of these messages has `role="alert"` or `aria-live`, so a screen reader never hears that Save failed.
- **Why it matters:** the moments you most need to read (a failed pick save near the lock, a failed sign-in) are the dimmest text on the page.
- **Fix:** use `text-danger-text` (9.2:1) for message text, keeping `destructive` for fills and borders. Add `role="alert"` to error paragraphs, ideally in one small shared `<FormError>` component.

**V3 · Disabled primary buttons are hard to read** — Low
- **Where:** `src/components/ui/button.tsx:6` (`disabled:opacity-50`); most visible on Grand Finale's "Save prediction (6/16)" (`src/components/grand-finale-box.tsx:351`).
- **What's wrong:** text on a disabled gold button is 2.7:1.
- **Why it matters:** the counter in that label ("6/16") is the progress information, and it's the part that's hard to read.
- **Fix:** show the count as normal text next to an enabled-looking but inert button, or raise disabled opacity to about 0.65 for the primary variant.

**V4 · Very small text in data-dense spots** — Low
- **Where:**
  - `src/components/episode-banner.tsx:92`, `:102` (8–8.5px track labels inside an `opacity-60` wrapper, `:84`);
  - `src/components/score-history-panel.tsx:113–114` (9px column heads);
  - `src/components/grand-finale-order-list.tsx:57` (9px badge);
  - `src/components/bottom-nav.tsx:45` (10px tab labels);
  - 10px in about 20 other places (roster, couples leaderboard, status pills).
- **Why it matters:** below about 11px, text is hard to read for many people, and opacity on top makes it worse. The NOW/NEXT marker is the curtain track's whole point.
- **Fix:** set a floor of 11px for anything a viewer must read, and drop the `opacity-60` on the track wrapper in favor of dimmer future dots only.

### Tap targets and touch

**T1 · Several key controls are 24–28px tall** — Medium
- **Where:**
  - **Account avatar on every page:** `src/components/account-settings-sheet.tsx:76` (`icon-sm`, 28px).
  - **Create a League / Join a League / Join with Code:** `src/components/create-join-league-dialogs.tsx:38`, `:81` (`xs`, 24px). These are the only actions on the empty Manage Leagues page for a brand-new user.
  - **Enter Results per-couple Publish / Save as Draft Score / Withdraw / Undo:** `src/components/results-form.tsx:844–921` (`xs`, 24px). They're used one-handed during the live broadcast.
  - **Grand Finale ↑/↓:** `src/components/grand-finale-box.tsx:404`, `:412` (28px).
  - **Draft order ↑/↓:** `src/components/draft-room.tsx:604`, `:612` (28px).
  - **Edit Picks and other `size="sm"` buttons:** 48 uses at 28px.
  - **Text inputs:** `src/components/ui/input.tsx:10` (`h-8`, 32px).
- **Why it matters:** Apple's minimum is 44px. A mis-tap on Publish posts live scores (the undo softens this). A tiny Create/Join is a weak first step for a new player.
- **Fix:** keep the visual size and add the same `before:` hit-area trick the strip pills use (`spoiler-free-strip.tsx`), or a shared `touch-target` utility. For the empty Manage Leagues state, show full-size buttons. Inputs can go to `h-10` on phones.

**T2 · Bottom sheets don't pad for the home indicator** — Low
- **Where:** `src/components/live-scores-prompt.tsx:82`, `src/components/spoiler-free-strip.tsx:166`, `src/components/draft-scores-strip.tsx:53` (`pb-8`); also `ui/sheet.tsx`, which has no `max-height` for bottom sheets.
- **What's wrong:** Dismiss and Not Yet sit about 32px from the bottom edge. A tall sheet (the I've Watched Through list with many weeks, on a small phone) can't scroll.
- **Why it matters:** on an iPhone the home-indicator swipe zone overlaps the last button, so a tap meant for Dismiss can send the app to the background. A sheet taller than the screen hides its own buttons.
- **Fix:** `pb-[max(2rem,env(safe-area-inset-bottom))]` plus `max-h-[92dvh] overflow-y-auto`, as `grand-finale-late-unlock.tsx:192` already does. **Phone check.**

**T3 · Draft room meaning lives only in hover tooltips** — Low
- **Where:** `src/components/draft-managers-card.tsx:19`, `:70` (`title=` for "In the room" and "On autopilot").
- **Why it matters:** `title` never shows on a phone, so the presence dot and autopilot icon are unexplained.
- **Fix:** put a short visible legend under the managers list, or `sr-only` text plus a tap-to-explain.

### Structure, navigation and states

**S1 · 404 and error pages are invisible dead ends** — High
- **Where:** `src/app` has no `not-found.tsx`, `error.tsx` or `global-error.tsx`. `notFound()` is called from `src/lib/league-page-data.ts:62`.
- **What's wrong:** a bad league link (removed member, deleted league, mistyped URL) shows Next's default "404 | This page could not be found." in black on the app's near-black background, with no nav (screenshot confirmed). A server exception on a busy live night shows Next's unstyled error page with no retry.
- **Why it matters:** the user sees an empty dark screen and has to know to edit the URL.
- **Fix:**
  - Add `not-found.tsx` that uses `PageHeader`, a one-line explanation and a "Back to Home" button.
  - Add `error.tsx` with "Something went wrong loading this page" plus a Try Again button that calls `reset()`.

**S2 · Only the four fan tabs have loading skeletons** — Medium
- **Where:** `loading.tsx` exists only for `(fan)`, `this-week`, `leagues/[id]/picks` and `leagues/[id]/standings`. Missing: `leagues/[id]/settings` (the gear on every league card), `leagues/[id]/draft`, `leagues/[id]/waivers`, `leagues`, `settings/*`, `notifications`, `admin/*`.
- **Why it matters:** on a slow night, tapping the gear or Manage › leaves the old page frozen with no feedback, which reads as a missed tap.
- **Fix:** a generic `loading.tsx` with the sticky top bar and two card placeholders for those routes (reusing `FanPageSkeleton` parts).

**N1 · Settings exists twice, in different orders, with three close/back patterns** — Medium
- **Where:** `src/app/settings/page.tsx:55–69` (full page, × at top-left); `src/components/account-settings-sheet.tsx:81–130` (side drawer).
- **What's wrong:**
  - The two menus list the same rows in different orders: Spoiler-Free Mode comes second in the sheet but fifth on the page.
  - Close and back controls vary: Settings and League Settings use ×, sub-pages use "‹ Settings", and Manage Leagues uses "‹ Back".
  - The account sheet is a 75%-wide right drawer, while every other sheet in the app rises from the bottom.
  - Profile and Account & Data open as dialogs from the sheet but as full pages from `/settings`.
- **Why it matters:** people learn one way to get to a setting, and here the route they take decides what they see.
- **Fix:** keep one menu component and render it in both places, in the same order. Pick one convention (‹ Back for pushed pages, × only for sheets and modals). Make the account sheet a bottom sheet like the rest, or make the avatar navigate to `/settings`.

**N2 · Tab bar semantics** — Low
- **Where:** `src/components/bottom-nav.tsx:20` (unlabeled `<nav>`), `:49` (active tab rendered as a plain `<span>`).
- **What's wrong:**
  - The current tab is shown by color only and isn't marked with `aria-current="page"`.
  - On Picks and Standings the tab bar comes before the page content in tab order.
- **Why it matters:** VoiceOver users hear four links with no indication of which page they're on, and have to step through the nav before reaching the page.
- **Fix:** add `aria-label="Main"` and render the active tab as a link with `aria-current="page"` (still styled as active). Move the nav after `{children}` in the shell's DOM; its fixed position won't change.

**N3 · Grand Finale and draft-order arrows have no names** — Low
- **Where:** `src/components/grand-finale-box.tsx:404–417`, `src/components/draft-room.tsx:604–617`.
- **What's wrong:** these buttons contain only "↑" or "↓", so a screen reader announces "up arrow, button" with no couple or direction. `custom-draft-order-card.tsx:67` and `draft-queue-card.tsx:87` do this correctly.
- **Why it matters:** reordering the bracket is the core Grand Finale task, and a screen-reader user can't tell which couple each arrow moves.
- **Fix:** `aria-label={`Move ${name} earlier`}` / `` `later` ``.

**N4 · No reduced-motion handling** — Low
- **Where:** `src/app/globals.css` has no `prefers-reduced-motion` rule. Affected: pulsing live dots (`spoiler-free-strip.tsx`, `live-scores-prompt.tsx`), sheet slide and zoom (`ui/sheet.tsx`, `ui/dialog.tsx`), and `transition-all` in `ui/button.tsx:6`, `ui/accordion.tsx:35`, `ui/switch.tsx:18`, `ui/badge.tsx:7`.
- **Why it matters:** people who turn on Reduce Motion (often for vestibular reasons) still get constant pulsing on live nights and sliding sheets on every tap.
- **Fix:** add a `@media (prefers-reduced-motion: reduce)` block that stops `animate-pulse` and shortens transitions. Replace `transition-all` with `transition-colors` where only color changes.

### Content and copy

**C1 · Title Case is broken on about 20 controls, and loading labels use "..."** — Low
- **Where:**
  - **Buttons:**
    - `leave-league-button.tsx:85` "Leave league"
    - `reset-draft-dialog.tsx:79` "Reset draft permanently"
    - `league-members-section.tsx:69`, `:109`, `:149`, `:240` "Promote to commissioner" / "Demote to manager" / "Remove member" / "Remove co-manager"
    - `grand-finale-box.tsx:351`, `:433` and `pick-em-box.tsx:289` "Save prediction"
    - `account-data-form.tsx:38`, `:94`, `:126` "Update email" / "Update password" / "Cancel deletion request"
    - `create-join-league-dialogs.tsx:74` "Create league"
    - `league-info-section.tsx:166` "Delete league permanently"
    - `request-deletion-button.tsx:54` "Request deletion"
    - `mark-week-watched-button.tsx:30` "Mark Week N as watched"
    - `schedule-manager.tsx:788` "Save changes" / "Add to schedule"
    - `league-modules-form.tsx:1249` "Update Anchor to match lock"
    - `join/[code]/page.tsx:45`, `:53` "Create an account to join" / "Sign in to join"
  - **Titles:**
    - `login/page.tsx:18` "Sign in"
    - `site-header.tsx:21` "Sign in"
    - `join/[code]/page.tsx:25` "You've been invited to a league"
    - `draft-room.tsx:565` "Draft hasn't started"
  - **"..." labels:** 36 pending labels ("Saving...", "Updating...") in the same files.
- **Why it matters:** CLAUDE.md's own capitalization rule. Mixed casing on buttons next to each other (e.g. "Promote" beside "Remove Co-Manager") looks unfinished.
- **Fix:** one pass converting these to Title Case and "…".

**C2 · Lock and air times use three formats** — Medium
- **Where:** `formatDeadline` in `src/lib/use-browser-time-zone.ts:20` ("10/20/2026, 8 PM EDT"). It's used by `pick-em-box.tsx:137` (Curtain Call "Locks at …"), `grand-finale-box.tsx:93`, `league-modules-form.tsx:272`, `:305`, `:428` (Season Clock "Currently Locks"), `draft-room.tsx:302` and `draft-status-card.tsx:36`. Meanwhile `formatAirsAt` (`src/lib/format-airs.ts`) gives "Tuesday 8 PM ET", and Home's stack shows "Locks in 4d 0h".
- **Why it matters:** the lock is the one time players act on. Seeing it as a numeric date with "EDT" on Picks, a weekday with "ET" on Home, and a countdown on the card makes people double-check. The numeric date also reads differently outside the US.
- **Fix:** have `formatDeadline` reuse `formatAirsAt`'s rules (relative day within a week, short weekday + month name beyond, and the zone collapsed to "ET"/"PT"). That's one change in one place.

**C3 · Internal or confusing terms** — Low
- **Where:**
  - `src/app/settings/page.tsx:67` and `account-settings-sheet.tsx:92` "Account-Wide";
  - `src/app/notifications/page.tsx:58` "In-app only for now — email/push delivery isn't built yet.";
  - `league-modules-form.tsx:674`, `:1210` call the same idea "Hard Deadline", "Anchor Week" and "Season Clock";
  - `standings-table.tsx:36` "of 3 players", while everywhere else says managers;
  - `settings/profile/page.tsx:40` repeats "Display Name" as both the card title and the field label.
- **Why it matters:** players read these labels, not the code. Build-status wording ("isn't built yet") and three names for one setting make the app feel unfinished and the setting harder to find.
- **Fix:**
  - "Account-Wide" → "Account".
  - Notifications helper → "You'll see alerts here. Email and push alerts aren't available yet."
  - Describe the Anchor Week in plain words once ("the week your scoring starts and settings lock") and drop "Hard Deadline".
  - "players" → "managers".
  - Retitle the Profile card to "Profile".

### Layout and content handling

**L1 · Long unbroken names overflow cards** — Low
- **Where:** `src/components/league-members-section.tsx:271–273` (member name span) and `src/components/league-rosters-card.tsx:67` (Dance Cards manager line on the Draft complete page). Both screenshots show "MaximilianBartholomewVonRichthofenSmythe" running past the card edge at 360px.
- **Why it matters:** display names are user-chosen, and the overflowing name runs into the Promote/Remove buttons on League Settings, where a commissioner is about to make a change.
- **Fix:** add `break-words` (or `[overflow-wrap:anywhere]`) to those name elements. Elsewhere, Standings already clamps to two lines.

---

## Conflicts with settled decisions

These are places where a skill's rule conflicts with a choice CLAUDE.md records or the code deliberately makes. They're listed only so you can decide; none of them is in the findings above.

1. **Pull-to-refresh is disabled** (`src/app/globals.css:122`, `overscroll-behavior-y: none` on every device). The guidelines say to suppress rubber-banding only for fine pointers and keep pull-to-refresh on touch. The code comment says it's deliberate ("the app refreshes itself"), and `RevealAutoRefresh` covers live nights. Outside those windows, though, a phone user has no gesture to reload.
2. **"URL reflects state" for expanded panels.** The guidelines want open panels in the URL. Score History rows and League at a Glance expand in place and persist through `usePersistedState`, which is settled. No change suggested.
3. **frontend-design's "template tells"** that this app uses on purpose:
   - middle-dot meta strings ("Week 6 · Curtain Up Soon", "Rank 1 of 3 · 0.00 pts");
   - all-caps labels ("YOUR ORDER SO FAR", `grand-finale-box.tsx:307`);
   - "Leaderboard →" (`results-form.tsx:1118`).

   These are written into CLAUDE.md's specs, and "no theme redesign" is settled, so they stay unless you want to revisit.
4. **frontend-design prefers sentence case** for UI copy. CLAUDE.md's Title Case rule wins; C1 applies CLAUDE.md, not the skill.
5. **A first-run explanation of the game** (the skill's "empty screen is an invitation to act"). A first-run tips overlay was offered and declined (BACKLOG). A3 deliberately stops at naming the league on the invite page.

## Guideline rules not applied

Desktop layouts, list virtualization (no list reaches 50 rows), `Accept-Language` detection, font preloading (`next/font` handles it), `<img>` dimensions (the only image has them), video and media, and a skip link (a single-column phone app with a four-item tab bar gains little).
