---
name: resume-handoff
description: "Pick up where the last session left off by reading the repo's MEMORY_HANDOFF.md (and BACKLOG.md), checking it against the actual repo, and reporting the state before doing anything. Use when the user says resume handoff, resume from the handoff, pick up where we left off, continue from last session, what's the handoff, or starts a fresh session in a repo that has a MEMORY_HANDOFF.md, or when they invoke /resume-handoff."
---

# Resume Handoff

Read `MEMORY_HANDOFF.md` and `BACKLOG.md` at the git root (`git rev-parse --show-toplevel`, not the current directory, unless the project's own instructions name another place) before anything else. Also read the project's own instruction file (`CLAUDE.md`, `AGENTS.md` or similar) if it has one. Its rules win over this skill and over the handoff.

If there is no `MEMORY_HANDOFF.md`, say so plainly. Offer what there is instead: `git log -10 --oneline`, `git status -sb` and `BACKLOG.md` if present. Then wait.

If there's no repo at all (for example a chat with no files), ask the user to paste their handoff file.

The handoff has four sections, written by `sync-handoff`: Current State, Changes Made, Key Decisions, Backlog & Next Steps.

1. **Check the repo against the handoff.** Run `git fetch`, then `git status -sb` and `git log -5 --oneline`.
   - Find the commit the handoff names as the current one. If it isn't HEAD, check it exists and is an ancestor (`git merge-base --is-ancestor <hash> HEAD`); if so, run `git log <hash>..HEAD --oneline` to list what landed since. If it's missing or not an ancestor, say so instead.
   - Flag the branch (or a detached HEAD), ahead/behind counts against the upstream, a missing upstream, and any claim the repo contradicts. Also compare against the remote's copy (`git log HEAD..@{u} --oneline`): other sessions may have pushed a newer handoff. The handoff can be stale.
   - A fetch that fails (offline, no remote, auth) is not a reason to stop. Say it failed and that the comparison is against local refs only.
2. **Sort the dirty files.** The working tree usually holds files from parallel sessions. Work out which dirty files the handoff claims as ours. Never stage, revert, stash or clean the rest. If a file isn't mentioned either way, list it as unknown and don't touch it.
3. **Check the dates.** Compare the handoff's date with today's. Name any hard date or deadline in it that has passed or falls in the next few days, and anything that was "after X" where X has now happened. Write dates as absolute dates.
4. **Restate.** Give Current State and Next Steps in 2-3 sentences, corrected for what steps 1-3 found.
5. **Respect Key Decisions.** Read them so we don't repeat a failed approach or re-propose something already settled. Before treating any backlog item as open, check it against the code, not the file. Note anything that is already done.
6. **Propose, then wait.** Say what you plan to do first, and why it comes first. Then stop. Don't edit files, commit, push or run anything that writes until the user says go. Read-only commands are fine.
