# Session Handoff

## 1. Current State

Draft PR **#13** (`cursor/curtain-call-pick-dropdowns-2103` → `main`): **Curtain Call chip grids are dropdowns**. Rebased onto latest `main` after **#9** (Mark as watched) plus **#11 / #12 / #14**. Owner approved merge; GitHub had blocked on conflicts — this rebase is so the coordinator can squash-merge. Do not merge from this session.

## 2. Changes Made

### Curtain Call picker UI (this branch)

`PickEmBox` no longer renders full-cast chip walls. Picks use the existing Base UI `Select`:

- Single-elim: **Who goes home?**
- Double-elim: **Eliminated (1 of 2)** and **Eliminated (2 of 2)** — same couple can’t sit in both; changing/clearing a slot does not soft-lock
- Top scorer: **Who scores highest?**
- Placeholder: **Choose a couple…**
- Save / locked / saved-summary unchanged; `submit_prediction` / prediction schema untouched
- Unused `Chip` component removed (it was only used here)

Kept from **#11 / #12**: card title **This week's picks**; subtitle is casual `formatEpisodeCasualWithTheme` (`Ep. 3` or `Ep. 3 — Latin Night — locks at …`), not `S35 E03` and not `Curtain Call — Ep. N` as the title.

This rebase only conflicted in `MEMORY_HANDOFF.md` (PR #9’s mark-as-watched handoff vs this branch’s). Picker code, `CLAUDE.md` dropdown note, and #9’s mark-as-watched behavior were left intact.

**Verification:** lint/tests/build run after this rebase. Phone-width pass already done on the previous #13 revision. **Not exercised this pass:** a live signed-in league on the Vercel preview.

## 3. Key Decisions & Lessons Learned

- Double-elim is two independent dropdowns, not sequential chip toggles. The other slot’s couple is omitted from the list; picking a duplicate also clears the other slot so the form can’t get stuck.
- `SelectContent` uses `alignItemWithTrigger={false}` so a 14-couple list doesn’t pin the selected row over the rest of the phone form.
- Don’t put API keys in the handoff; this container still has no live `.env.local` for the real project.

## 4. Backlog & Deferred Items

- Carry-forward: Recast/waivers spoiler framing; `/notifications` `rankBadge` unfiltered-sum leak; roster-eliminated-couple clamp; feature-announcement mechanism; Home season strip (#14); Past picks vs results (#10).
- Live signed-in Your Picks click-path on PR #13’s Vercel preview still owed if the coordinator wants a post-rebase visual check.

## 5. Next Steps

1. Coordinator: squash-merge draft PR **#13** now that it is conflict-free on latest `main`. Do not merge from this session.
2. Concurrent `main` activity is still a thing — `git fetch origin main` before assuming this branch’s base is current.
