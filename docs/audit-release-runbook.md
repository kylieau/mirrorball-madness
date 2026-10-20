# Audit remediation release and recovery

## Release order

The small pre-show patch is SEC-3/BE-2 only. All remaining changes need the
database migrations below and should ship after E07, outside live scoring.
Do not deploy the complete remediation branch before its migrations.

Guest browsing (`c6d73e4`) shipped separately before E07 and is merged into this
branch. Its grants (`supabase/apply-guest-browsing.sql`) are already applied live
and are in `schema.sql`, so they are not part of the steps below. After deploying
this branch, also confirm a signed-out visitor still sees Home and Results, and
that `/picks` and `/standings` show the sign-in card.

First rehearse the migration and application together on staging with disposable
data, including the checks in step 6. A local build/PGlite pass is not staging
validation. For production Supabase **mirrorball-madness** (`wssbwgtsejamlbvfofvu`):

1. Take a private database backup and verify its archive listing. Inspect pending
   correction drafts; close Enter Results tabs during migration and reopen them
   after deployment. Do not use real results as QA fixtures.
2. Apply `supabase/apply-audit-security.sql` in the Dashboard SQL Editor.
   This invalidates previously exposed, unexpired legacy co-manager codes;
   their owners must generate fresh invitations. Existing accepted co-managers remain.
3. Apply `supabase/apply-audit-deadlines.sql`, then
   `supabase/apply-audit-settings.sql`, followed by
   `supabase/apply-audit-prediction-provenance.sql`. All files are transactional and rerunnable.
   They preserve historical picks/standings and current expired deadlines.
   New co-manager invitations expire after seven days; an owner can reissue one.
4. Regenerate Supabase types, compare them with the checked-in contracts, and
   deploy the application. These migrations retain the existing publication RPC
   signature so the previous application can still publish during rollout.
5. In Accounts → Results Contributors, explicitly approve the people who may
   enter global draft scores. Site admins retain access automatically. Creating
   or commissioning a league no longer grants global results access.
6. Verify ordinary-member invite privacy, legitimate invitation redemption,
   contributor entry, admin corrections, predictions/reload, and a synthetic
   multi-night publish/reveal/undo on staging. Production publish verification
   should observe the next real event, never manufacture results.

## Backups

The container has neither a database connection URL nor `pg_dump`. The backup
script is prepared; no complete database backup has been created by this work.
On a trusted machine with a PostgreSQL client matching the server:

```
node --env-file=.env.local scripts/backup-database.mjs /private/backups/mirrorball-before-audit.dump
pg_restore --list /private/backups/mirrorball-before-audit.dump
```

Supply `SUPABASE_DB_URL` through private environment configuration. Never place
archives in the repository, CI artifacts with public access, or frontend assets.
Use encrypted private storage, retain several generations, and run this before
live nights and schema changes. A successful dump is not a tested recovery.

Rehearse restoration into a separate Supabase project with compatible platform
roles/extensions using `pg_restore --no-owner --no-acl --exit-on-error`. Restore
roles/platform objects according to that project's permissions; do not blindly
restore a production archive over a running project. Verify authentication,
memberships, invitation permissions, rosters, picks, score parity and RLS with
two synthetic accounts before declaring the restore usable. Record recovery
time and archive checksum privately. Establish a scheduled job on the trusted
machine; no recurring backup service has been provisioned here.

## Email ownership and recovery

Read-only configuration on 2026-10-20 confirmed custom SMTP is absent.
Keep `AUTH_EMAIL_ENABLED=false` and do not turn off auto-confirm yet.

After configuring and verifying a sender with the chosen SMTP provider:

1. Configure custom SMTP in Supabase. Test delivery to controlled addresses
   outside the project team, including mobile email applications.
2. Set the signup template link to
   `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup` and the recovery
   template to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`.
   Application redirects always include a `?next=` parameter. Use the deployed
   `/auth/confirm` route; it verifies the one-use token before setting cookies.
3. Enable email confirmation, set `AUTH_EMAIL_ENABLED=true` for the deployment,
   and test invitation signup, recovery on another browser/device, expired and
   reused links, and Google sign-in. Keep both production callback hosts and
   the native callback on the restricted redirect allow-list.
4. Review existing email/Google-linked accounts with their owners. Linked
   identities are not proof of compromise. Establish ownership before resetting
   credentials or revoking sessions; confirmation only protects future signups.
   Do not bulk-delete identities, disable the existing email provider, or send
   unsolicited resets as part of a migration.
5. Enable stronger password and leaked-password checks where supported by the
   existing plan; assess captcha separately. Do not upgrade billing automatically.

## Historical data and operations

- DATA-8's week-2/week-3 backfills still require factual owner confirmation.
  Do not delete picks or run `scripts/recompute-published-weeks.ts` automatically.
- Recheck open late-entry windows before the episode. Once deadline protection
  is installed, late submissions wait while an aired competition week remains
  unpublished; self-unlock is refused, including for an admin's own team.
- Closed Grand Finale deadlines cannot be reopened by anchor edits, schedule
  changes or draft resets. Scoring exemptions and East/West league choices remain.
- Browser termination can interrupt requests. Editor links await a dirty save;
  closing/reloading prompts when edits remain. Abrupt termination still requires
  a reload check against the acknowledged server state.
