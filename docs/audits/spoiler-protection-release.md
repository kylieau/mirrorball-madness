# Small spoiler-protection release

This independent patch addresses SEC-3/BE-5/FE-2 and BE-2/OPS-5 only.
Scores and Schedule receive draft summaries, never draft judge scores,
outcomes, jeopardy, songs, or custom moments. Unreadable viewer preferences
produce a retryable error instead of silently disabling Spoiler-Free mode.
Both account-settings and Score History reads are covered.

No SQL migration is required. This patch preserves the current results-entry
permissions, release controls, scoring calculations, and publication writes.
The larger audit remediation requires separate migrations and a coordinated
release after E07; do not deploy that branch as this small patch.

Verification: focused payload/preference regressions pass. Check the deployed
Scores/Schedule HTML and RSC responses and profile-read failure behavior before
calling the production exposure closed. Physical-device checks remain separate.
