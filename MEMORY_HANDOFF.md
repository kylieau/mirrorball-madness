# Session Handoff

## 1. Current State

Docs-only park on `cursor/episode-dropdown-layout-backlog-7612` (draft PR into `main`). No UI or code. Do not implement the dropdown move from this PR. Do not merge from the agent.

## 2. Changes Made

Parked Kylie's (via Chief Kimo) episode-dropdown layout note in `BACKLOG.md` under **View Results / This Week layout polish**:

- She doesn't like the episode dropdown sitting *above* the episode title. Move it to the **same line as the title, right-aligned**.
- Reference UX: Curtain Call **Past picks** card (title left, `WeekSwitcher` in `CardAction` right). Symptom: chevron/switcher above the theme line (e.g. "— Premiere: Night Two…").
- Grouped with the existing DND / "—" live-check (still needs a real published Did Not Dance couple).

Past picks vs results stays **owner-approved, not started** on `main` (PR #15 is still a draft). This PR does not rewrite that section as implemented.

## 3. Key Decisions & Lessons Learned

- Layout nits for This Week / View Results belong in `BACKLOG.md`, not a drive-by UI PR.
- Do not use Past picks as "already shipped" copy until #15 merges.

## 4. Backlog & Deferred Items

See `BACKLOG.md` **View Results / This Week layout polish** for the grouped items (episode dropdown on the title line; DND / "—" live check).

Carried forward (untouched):

- Home season strip (#14) and Past picks vs results (#10) — owner-approved, not started.
- Recast/waivers spoiler framing; `/notifications` `rankBadge` leak; roster-eliminated clamp; feature-announcement infra.

A2HS (#6) is on `main`.

## 5. Next Steps

1. Merge this docs PR when ready — planning note only, not a product change.
2. Do not implement the episode-dropdown move until this backlog item is picked up.
