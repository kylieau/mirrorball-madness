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

## First live night after the release (E08)

E08 (Week 7, Horror Movie Night, single elimination, its week's only episode)
airs Tue Oct 27, 8 PM ET (`2026-10-28 00:00 UTC`). This is the first real
publish, reveal and undo on the released code. Observe them; never stage them
with fake scores.

State checked 2026-10-22 with the service role:
- No Results Contributors are approved. Only the site admin can enter E08 scores.
- Two Grand Finale late entries are still open and unsubmitted: Jonathan Au in
  #supportSWEKylie (80%) and arielle in Carrie Ann's Biggest Fans (100%). Their
  submits are refused from the curtain until E08 publishes. The six couples
  already out never pay them, whenever they submit.
- Published episodes 1 and 3–7 still have correction drafts (the six tagged by
  the release). Publishing E08 doesn't touch them.

Before the curtain:
1. Approve contributors in production → Admin → Accounts → Results Contributors.
2. Tell the two late-entry managers to submit before 8 PM ET Tuesday, or close
   their entries in League Settings → Grand Finale → Missed the lock.
3. On a laptop, open production `/admin/results/enter?episode=` for E08 in one
   tab only. Check there are 10 couples, each with one dance row, and that the
   judges are the standing panel (E08 has no guest judges).

During the East broadcast (per couple, as it airs):
4. Enter the scores, wait for "Draft saved", then **Save as Draft Score**. On a
   second, non-admin account (a phone is fine), Stay Updated on the Scores Are
   Going Live prompt, which only appears once a couple is released. Confirm the
   amber Draft scores strip and that couple's draft points on Home, Results,
   Picks, Standings and the league switcher.
   Withdraw once and confirm it disappears for that viewer.
5. Tap **Publish** on one couple, then **Undo** inside 30 seconds. Confirm its
   points vanish from Standings. Publish it again, let the timer run out, then
   **Un-Post** and Publish once more. Check every page from step 4 with a mix of
   released and live-revealed couples.
6. A Spoiler-Free viewer who hasn't chosen Stay Updated or Mark Watched must see
   neither draft nor live points.

After the West broadcast (after 10 PM PT):
7. Post every couple, tick outcomes in **Finish Week**, and finish the week.
   Confirm that Results shows the elimination, Standings has Week 7 totals,
   no draft strip remains and the Home banner reads Scores Are In.
8. Ask Claude to verify with the service role: no `draft_*` rows or releases left
   for E08, one `weekly_manager_scores` row per team per league for Week 7,
   `results_published_at` set and the eliminated couple's status updated.

If something goes wrong:
- "Results or scoring inputs changed. Refresh and try again." means the snapshot
  moved (another tab or contributor saved). Reload and publish again. Nothing
  was written.
- "Post every couple before publishing results": a couple with a drafted dance
  is still unposted. Publish it first.
- Any other publish error rolls back in full. Don't retry blindly. Note the
  message and stop, since the live data is unchanged.
