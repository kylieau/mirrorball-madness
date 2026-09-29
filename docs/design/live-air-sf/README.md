# Live-air + Spoiler-Free design packs

Reference only. Not production UI.

Engineering source of truth for the locks is [CLAUDE-HANDOFF.md](./CLAUDE-HANDOFF.md).

| Folder | What |
|--------|------|
| [mirrorball-live-air-east-sf-on/](./mirrorball-live-air-east-sf-on/) | Mid-East air, Spoiler-Free on. Stay / grayed Mark Watched / Dismiss. |
| [mirrorball-live-air-west-sf-on/](./mirrorball-live-air-west-sf-on/) | Mid-West air, Spoiler-Free on. Stay (published) / Mark Watched enabled / Dismiss. |
| [mirrorball-follow-along-latest/](./mirrorball-follow-along-latest/) | Post–East Follow along strip: Latest couple/dance + Light honesty. Placement A locked. |
| [mirrorball-draft-gap-post-east/](./mirrorball-draft-gap-post-east/) | Post–East draft gap, Option A strip (SF on and SF off). |
| [mirrorball-sf-live-air-alignment/](./mirrorball-sf-live-air-alignment/) | SF × live-air matrix and unlock/strip sync boards. |
| [mirrorball-live-air-prompt/](./mirrorball-live-air-prompt/) | Earlier live-air prompt set. Some phones are stale versus the locks in the handoff. |
| [mirrorball-live-air-current/](./mirrorball-live-air-current/) | Production stills used as phone bases. |

Swipe crops are each pack’s `pngs/`. HTML boards are the mocks those crops came from.

Absolute symlinks in the archive were replaced with the real file when it lived in this archive or in an existing `docs/design/` pack, so this tree has no symlinks. `shared.css` was not in the tarball (it pointed at `mirrorball-mark-watched-ux/shared.css`); the copy here is the same stylesheet already committed with the other design packs. Stills whose sources were not in the archive or the repo were left out (curtain-state crops, draft-scores-strip crops, west-live-reveal, sf-banner, mark-watched, and two strip-posting stills). The rendered `pngs/` boards are the visual record of those boards.
