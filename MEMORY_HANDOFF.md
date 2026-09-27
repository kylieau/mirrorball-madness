# Session Handoff

## 1. Current State
**No feature work this session — a sync-and-verify session only.** Fast-forwarded local `main` from `4378288` to `fd50ff1`, pulling in four PRs done elsewhere (`#35`–`#39`: curtain chip copy, Spoiler-Free copy + 4-week picker, SF strip Soft inset/Pattern B, Draft Scores unlock, Grand Finale late-entry unlock). `CLAUDE.md` and `BACKLOG.md` already reflect all of it — no doc catch-up needed. The two new Supabase SQL scripts these PRs shipped were confirmed **already applied to the live production DB** (see §3). Next session was told it's resuming on Grok/Cursor, not here.

## 2. Changes Made
**None — this session touched no app code.** Verification scripts were written to `scratch/` and deleted before finishing.
**Not ours, leave unstaged:** `ios/App/App.xcodeproj/project.pbxproj` (modified, pre-existing); untracked `scratch/` (`prefill-week3-draft.mts` fails lint on `any`, kept on purpose — a full `npm run lint` reports 4 errors there and none in `src`).

## 3. Key Decisions
- **How to confirm a Supabase migration already ran, with no DB shell access:** call the RPC via the service-role key. `"permission denied for function X"` means the function exists (grants restrict execute to `authenticated`, and `service_role` isn't `authenticated`); PostgREST's `"Could not find the function ... in the schema cache"` means it's genuinely missing. Verified this distinction against a known-good baseline RPC and a made-up name before trusting it. Used it to confirm `apply-draft-scores-unlock.sql` (columns + all 3 functions) and `apply-grand-finale-late-unlock.sql` (table + column set + function) are both live — the latter also has a real, in-flight unsubmitted row (a commissioner already opened a late-entry window for a manager today), so that feature isn't just deployed, it's in active use.

## 4. Backlog & Next Steps
Nothing deferred from this session. Everything outstanding is still in [BACKLOG.md](BACKLOG.md); its top item is unchanged: check everything in "Built but not checked" starting with Tuesday's episode (2026-09-29, 8pm ET / 5pm PT — West feed 11pm ET / 8pm PT). One thing worth a look next time someone's back in this repo: `BACKLOG.md` has no "unchecked in a browser" entry for Draft Scores unlock or Grand Finale late-entry (`#38`/`#39`) the way earlier UI work does — confirm whether that's because they were already exercised for real (the live late-unlock row suggests at least GF late-entry has been), or whether they just need one added.

`git fetch && git status -sb`
