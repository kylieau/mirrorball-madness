# Audit Remediation Release — 2026-10-22

Released 2026-10-22 per `docs/audits/audit-release-runbook.md`: private backup taken,
the four `apply-audit-*.sql` scripts dry-run in one rolled-back transaction and
then applied live, the app deployed from `main` (`997de1a`), and types regenerated
from the live project. Production was verified with throwaway accounts (League
Settings, revision-checked settings saves, invite privacy, picks with provenance,
contributor self-grant refused) and signed out. No staging project was used (no
free project slot). Still to observe on a real night: publish, reveal and undo.
Custom SMTP is absent, so `AUTH_EMAIL_ENABLED` stays false. No historical picks or
standings were changed or recomputed.
