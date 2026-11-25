# Audit summary — 2026-10-20

A read-only audit of Mirrorball Madness in five areas: security and access control, scoring and data integrity, backend code, operations, and frontend code quality. It ran 17–20 October, and nothing in the app, schema or live data was changed. Each area had an auditor and a gap-finding pass. Every finding was then checked by an independent verifier told to disprove it; high-severity findings got three verifiers and needed a majority. 113 findings survived, 2 were dropped in verification and many had their severity lowered. Attack tests ran against a PGlite copy of `schema.sql`. Live checks were read-only, apart from throwaway accounts that were deleted afterwards (none remain).

Several problems were found independently by more than one area. Each is listed once below, with its other IDs.

## Top issues

1. **[SEC-2](security-audit.md) · Any leaguemate can read another team's co-manager invite code and take over that team** — High. Also [BE-1](backend-audit.md).
   Codes for pending co-manager invites are readable by every member of the league, directly and through realtime. Redeeming one from a second account makes you a full co-manager, and on the commissioner's team that includes renaming, resetting or deleting the league. One pending code exists on live.
2. **[SEC-3](security-audit.md) · Scores and Schedule send unreleased draft scores and drafted eliminations to any signed-in user** — High. Also [BE-5](backend-audit.md), [OPS-2](operations-audit.md), [FE-2](frontend-audit.md).
   Both pages are open to everyone and load every episode's draft with the service-role client into the page data. On a live night anyone can read drafted eliminations before publish, bypassing the release gating.
3. **[SEC-1](security-audit.md) · The live auth redirect allow-list accepts any `*.vercel.app` callback** — High. Also [OPS-1](operations-audit.md).
   Anyone can deploy a `vercel.app` site, so a crafted Google, magic-link or recovery link can send a user's session tokens to an attacker's site. Two allow-listed hosts are also dead. This is a dashboard setting, not code.
4. **[OPS-3](operations-audit.md) · Whoever signs up with someone's email first can keep password access after the real person signs in with Google** — High. Also [SEC-18](security-audit.md).
   Sign-ups are auto-confirmed, so Google sign-in links onto the squatter's account and the squatter's password still works. 4 of 58 live accounts already have both identities.
5. **[DATA-1](data-integrity-audit.md) · Any signed-up user can block results publication for every league** — High.
   A new account can create a league and save a lock-hours or weight value that JavaScript can't round-trip. From then on every official publish fails with "Results or scoring inputs changed. Refresh and try again", and nothing points to the cause. Live data isn't poisoned today.
6. **[SEC-4](security-audit.md) · A commissioner can reveal everyone's pre-lock picks, or reopen picks, by editing the lock settings** — High. Also [DATA-7](data-integrity-audit.md).
   Raising the lock hours shows the whole league's Curtain Call picks early; lowering them reopens submits. Flipping the coast to West after the East broadcast reopens picks after the elimination is public. Nothing records the change.
7. **[FE-1](frontend-audit.md) · Scores › By Couple tells a Spoiler-Free viewer when each couple went home** — High.
   Unwatched weeks render as "Locked" rows, but a couple's rows stop after its elimination week, so the row count gives it away for anyone two or more weeks behind.
8. **[BE-2](backend-audit.md) · Spoiler-Free turns off by itself when one profile read fails** — Medium. Also [OPS-5](operations-audit.md).
   A failed read defaults the mode to off, so one bad 20-second refresh on a live night shows a behind viewer every completed week, including tonight's elimination.
9. **[DATA-2](data-integrity-audit.md) · A late Grand Finale entry can be paid for an elimination that has aired but isn't published** — Medium. Also [SEC-7](security-audit.md), [BE-9](backend-audit.md).
   Two late unlocks are open and unused on live right now. Either manager could submit after tonight's East broadcast with the eliminated couple in the right slot and be paid in full.
10. **[DATA-3](data-integrity-audit.md) · Moving the Anchor Week (or resetting a draft) reopens Grand Finale brackets after eliminations have aired** — Medium. Also [SEC-5](security-audit.md), [SEC-8](security-audit.md).
    All four drafted live leagues are `locking_exempt`, so the Season Clock lock never applies to them; CLAUDE.md doesn't mention that flag. One live bracket was submitted after a week-2 elimination and was paid 41.65 points (cause unproven).
11. **[OPS-4](operations-audit.md) · There are no database backups and no restore plan** — Medium.
    The project is on the Free plan with PITR off and an empty backup list. A deleted league, a bad hand-run SQL script or an accidental truncate can't be undone.
12. **[BE-3](backend-audit.md) · A stray draft on a published episode can wipe the night on the next correction publish** — Medium.
    An autosave landing during or just after publish recreates a one-couple draft. A later correction then treats that draft as the whole night, deleting the other couples' dances and un-eliminating the eliminated couple. Nothing is armed on live today.
13. **[FE-3](frontend-audit.md) · After results go live, Curtain Call shows last week's picks as "Picks saved" for the new week** — Medium.
    The pick box keeps its old state across the 20-second refresh, so a manager can believe they have picked when they haven't.
14. **[OPS-8](operations-audit.md) · Rebuilding from `schema.sql` leaves row-level security off on 35 of 36 tables** — Medium. Also [SEC-12](security-audit.md), [DATA-15](data-integrity-audit.md).
    Live depends on an `ensure_rls` event trigger that isn't in the repo. A fresh project built from the schema would expose pre-lock picks and let users edit each other's profiles.
15. **[DATA-8](data-integrity-audit.md) · Some Curtain Call picks were written after lock outside the app, with no record of who wrote them** — Low.
    They are probably operator backfills, but the data can't tell them apart from post-result picks, and every recompute keeps paying them (194.78 standings points across four leagues). Kylie to confirm the week 2 and 3 rows were intended.

## By area

| Area | Report | High | Medium | Low | Dropped |
|---|---|---|---|---|---|
| Security and access control | [security-audit.md](security-audit.md) | 5 | 4 | 12 | 0 |
| Scoring and data integrity | [data-integrity-audit.md](data-integrity-audit.md) | 1 | 6 | 10 | 0 |
| Backend code | [backend-audit.md](backend-audit.md) | 1 | 12 | 14 | 1 |
| Operations | [operations-audit.md](operations-audit.md) | 3 | 5 | 13 | 0 |
| Frontend code quality | [frontend-audit.md](frontend-audit.md) | 1 | 10 | 16 | 1 |

Counts include each report's conflicts section. The same problem often appears in two or three areas, so the totals overstate the number of distinct issues.

## Conflicts with settled decisions

For Kylie to decide; nothing to build unless asked.

- **SEC-20 (High) and BE-25 (Medium) · Propose tier is self-service.** Creating a league makes any new account a commissioner, and so able to overwrite drafts, release or withdraw couples and wipe a night's draft season-wide (see also SEC-9, SEC-17).
- **BE-26 (Medium) · A planted or stale correction draft is installed wholesale** by the admin's next correction publish.
- **SEC-21, DATA-17, BE-27 (Low) · West Coast leagues' Curtain Call stays open after the East broadcast has shown the elimination.**
- **FE-27 (Low) · The Couples Leaderboard shows a couple's newest owner,** which can reveal a recast from a week the viewer hasn't watched (latent; no live league uses Recast).

## Suggested order of work

**Before the next live night (E07, Tuesday 20 October, 8 PM ET):**
- In the Supabase dashboard, remove `https://*.vercel.app/auth/callback` and the dead hosts from the redirect allow-list (SEC-1). No code change.
- Take a manual database dump before the show (OPS-4).
- Decide on the two open late Grand Finale unlocks: close them, or accept that a submit after the East broadcast is paid (DATA-2).
- Don't change Air Time, Pick 'Em Lock or the Anchor Week during the week (SEC-4, DATA-3).
- If there's time for one small deploy: stop sending full drafts to the Scores and Schedule pages (SEC-3), and make Spoiler-Free fail closed when the profile read fails (BE-2).

**Soon after:**
- Column-scope `league_members` reads so invite codes stay private (SEC-2).
- Validate and bound settings values in SQL, and compare the publish snapshot on the server (DATA-1).
- Guard the lock settings once a week's lock has passed (SEC-4), and freeze Grand Finale brackets once their deadline passes (DATA-3).
- Stop Scores › By Couple from rendering unwatched weeks (FE-1).
- Connect SMTP and turn on email confirmation, which is already a BACKLOG prerequisite for forgot password (OPS-3).
- Refuse draft saves on published episodes (BE-3), and re-sync the Curtain Call box when the week changes (FE-3).
- Set up regular backups (OPS-4).

**Later:**
- Put the RLS setup into `schema.sql` (OPS-8).
- Add provenance to `predictions` (DATA-8).
- Work through the remaining Medium and Low items in each report.
