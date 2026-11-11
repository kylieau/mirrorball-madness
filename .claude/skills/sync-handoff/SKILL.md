---
name: sync-handoff
description: "Rewrite the repo's MEMORY_HANDOFF.md as a lean snapshot of the current session, then commit and push it, so the next session (any device, any model) can pick up cold. Use when the user says sync handoff, update the handoff, save the handoff, write a handoff, or is about to clear, compact or end a session and wants the state saved, or when they invoke /sync-handoff."
---

# Sync Handoff

Sync `MEMORY_HANDOFF.md` with our latest progress. It is the one file a fresh session reads to know where things stand. `resume-handoff` reads it, so keep the four sections below exactly as named. `BACKLOG.md` (optional) holds everything deferred. Both live at the git root (`git rev-parse --show-toplevel`), not the current directory, unless the project's own instructions name another place.

Before rewriting, check `git status` for staged or unstaged edits to either file. Those are someone else's: keep them in your rewrite, and ask if one conflicts with what you'd write.

Act as a strict editor. Read the existing file and rewrite it as a single concise snapshot. Never append logs to the bottom. Never drop content just to save space: if it still matters, move it to `BACKLOG.md` instead (create it if the project has none). Finished work that git history or the project's docs already record can go. Don't duplicate an item that's already in `BACKLOG.md`.

If `MEMORY_HANDOFF.md` doesn't exist yet, create it with the four sections below.

Start the file with a one-line title holding today's date (with the year, and the timezone if the project works in one) and the commit the work sits at (not this handoff commit). Write every date in the file as an absolute date: "Thu Nov 12, 2026", never "tomorrow" or "next week".

Never put secrets, credentials, or personal data that doesn't belong in the repo into either file. The repo may be public or shared.

## Sections

1. **Current State**: the exact feature or fix in focus, and whether it is committed, uncommitted, pushed, deployed or verified. Name the branch and the commit it sits at. Say what was checked and what wasn't, so the next session doesn't assume it was verified.
2. **Changes Made**: from `git status` and `git diff --stat`, but attribute only files this session touched. Parallel sessions often dirty the same working tree, so call out anything that isn't ours and leave it unstaged.
3. **Key Decisions**: add new constraints and anything the user settled, with the reason, so a later session doesn't re-propose it. Keep older ones only if they still affect upcoming work.
4. **Backlog & Next Steps**: anything deferred belongs in `BACKLOG.md`, not here, since this file gets overwritten every session. List hard dates and deadlines with their absolute date. Before deleting a task as done, check it against the code, not against this file. End with the exact next command to run (or "Next command: none pending.").

## Commit and push

Then commit and push. When the user asked for this (by invoking it or asking to sync, update, save or write the handoff), that is their yes to commit and push the handoff commit. It authorizes nothing else. If you are running it on your own initiative, write the file and ask before committing.

- Check the index first (`git diff --cached --name-only`). If anything other than the two handoff files is staged, leave it alone and stop before committing: say what's staged.
- Stage by name: only `MEMORY_HANDOFF.md`, plus `BACKLOG.md` if you changed it. Never `git add -A` or `git add .`. If neither file changed, skip the commit and say so.
- Commit message: `docs: sync memory handoff state`. Follow the project's own conventions (CLAUDE.md or similar) for attribution lines, signing and staging rules; they win over this skill.
- Before pushing, list what would go out (`git log @{u}..HEAD --oneline`). If anything besides the handoff commit is in it, don't push: those commits weren't authorized by this skill. Report them and ask.
- Push the current branch to its own upstream only. If the project's rules forbid pushing without asking, ask once instead.
- If there is no upstream, the HEAD is detached, or it isn't a git repo: commit (or just write the file) and say plainly that nothing was pushed. Never invent a remote or a destination branch.
- If the push is rejected, report it and stop. Don't pull, rebase, stash, reset or force-push to get it through.

Finish with one short line: where the handoff now stands (commit hash, pushed or not).
