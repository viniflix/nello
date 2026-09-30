# Backend reconstruction contract — Wave 01

Production is Supabase `afyoidxrshkmplxhcyeh`, PostgreSQL 17. Git must reproduce its
catalog before behavior-changing waves. `baseline.json` records 213 applied migrations
and eight deployed functions as captured on 2026-09-30. Sources contain metadata and
DDL, no exports of users, patients, medical records or Storage objects.

## Safe execution

1. `npm ci` with `.nvmrc` and the pinned package manager.
2. `npm run check:backend` validates checksums without starting any service.
3. On a disposable REMOTE GitHub Actions runner, `node scripts/backend/prepare.mjs`
   creates `.backend-ci/supabase`. It refuses local execution or an existing destination.
4. Supabase CLI starts only that unlinked disposable workdir. No production credentials
   are available in the reconstruction workflow.
5. `catalog.sql` queries metadata; `compare-catalog.mjs` fails on differences in
   relations, columns, grants, RLS, policies, functions, constraints, triggers, indexes,
   enums and bucket restrictions. A successful build alone does not prove parity.

The flat legacy migration files are retained because existing tests reference them
and one contains an unrelated user edit. They never enter the generated replay path.
Do not run default `db push` against this repository: the root migration guard is off.
Forward migrations belong in `supabase/migrations/releases`, not the legacy root.

## Auth: local settings versus production invariants

The checked-in config is for reconstruction, not a command to overwrite hosted Auth.
Loopback ports and site URL are disposable-runner settings. Email confirmation enabled,
anonymous sign-in disabled and TOTP enrollment/verification enabled mirror hosted
invariants. Minimum password length 6 and password reauthentication disabled are the
observed baseline, not a declaration of adequate hardening; Wave 04 owns those changes.
Canonical production site is `https://nellonutri.com.br`. Hosted SMTP/provider secrets,
access tokens and database passwords are never stored here. Changes to the redirect
allowlist and password settings require the Auth journey matrix in Wave 04.

## Function compatibility

All eight deployed endpoints require JWT verification. `sentry-test`, `sentry-issues`
and `delete-user-securely` retain fail-closed responses for existing URLs. They are not
reenabled as part of reconstruction. The remote food proxy contains a misplaced
TypeScript-only `FoodRequest` declaration; the already validated local declaration
in `validation.ts` is retained. Its runtime implementation matches the published one.
This source drift is explicit and is not silently overwritten with an invalid type.

No function or SQL is deployed to production by the reconstruction workflow. A future
production migration/function release must separately pass its own wave gates and
backup/compatibility checks. Capture revisions and commit SHA together in release
evidence. Product version starts at 0.1.0; Sentry/PostHog release remains the deployment
commit SHA, maintaining existing observability correlation.

CI/local verification uses exact Node 22.18.0 and npm 11.5.2. Vercel supports pinning
the [Node major](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
and applies minor/patch updates itself, so `engines.node` is `22.x`, consistent with
the existing hosted project. Vercel install/build commands explicitly invoke npm
11.5.2; `.nvmrc` remains the reproducible verification runtime. This provider limit
is documented rather than claiming production has an exact minor pin.

## Historical provider compatibility

Remote CI run 36667008654 failed before application migrations because the February
snapshot captured five vendor-owned prefix triggers whose functions no longer exist.
Production metadata confirms these triggers are absent. Supabase's own [Storage
migration 0052](https://github.com/supabase/storage/blob/master/migrations/tenant/0052-drop-not-used-indexes-and-functions.sql)
retired them. The CI adapter conditionally creates only those five EXACT statements
when their vendor function exists. Original files and checksums are preserved; all
application policies/grants remain intact, and unknown statements make the adapter fail.
This exception is unrelated to patient authorization or bucket privacy.

Function hashes normalize CRLF to LF; 48 hosted function bodies used Windows line
endings. This avoids treating a checkout line ending as a contract change. Every
other character of the definition, security mode, search path and grant is compared.

CI run 36667594975 advanced past the provider mismatch and then exposed eight
application tables created outside recorded migrations: bug_reports, feed_tasks,
message_templates, notification_rules, nutritionist_patients,
operational_observability_log, patient_module_sync_flags and template_dispatch_log.
Their columns/constraints come from live metadata, with FK restoration after dependent
tables exist. Indexes, RLS, policies, grants and triggers are restored ONLY on CI,
then compared against production. No rows from those tables were read or exported.
This reconstruction foundation is evidence of historical drift, not a production
migration and not a replacement for later security corrections.

Run 36668123617 exposed additional unrecorded columns (starting with
activity_log.actor_user_id). After reviewing inline table definitions and view columns,
static comparison identified 22 table column foundations and
function definitions missing from recorded CREATE statements. These are explicit
metadata-only prerequisites. The final live function snapshot retains manual body
changes and makes all 382 application functions reviewable from Git. It contains no
user/patient rows, access tokens or literal email addresses. Function bodies and
ownership/grants remain subject to the catalog parity gate; capture alone is insufficient.

Run 36668603945 showed activity_log is created later than the initial snapshot;
its four missing columns are restored immediately after that recorded CREATE,
before the index consumer. Other foundations target tables already present. Current
food_measures columns belong to a later recorded table replacement, and foods is a
view: neither is incorrectly added to the early table foundation.

Run 36669300311 advanced through the table/index repairs and found that a March
Storage policy calls is_admin before its first recorded declaration. The reviewed
foundation initially exposed 39 candidate signatures. The final early prerequisite
contains only ten signatures across eight names with historical consumers;
other current functions are supplied by the final snapshot. Consumer name mentions
are not counted as evidence that a function definition was versioned.

Run 36670647782 reached the March 24 bug-report hardening and exposed an obsolete
policy rename whose creation was never recorded. CI guards only that exact rename
when the old policy is absent. The replacement policy, its checks, all admin policies
and the deprecated-policy removal execute unchanged. Applied source/checksums remain
immutable; no production policy is modified. Unknown or duplicate statements fail
the adapter, and final permission metadata must still match production.

Run 36671202763 advanced to the April schema move. `public.is_admin` must exist
before March policy consumers, but its private copy must be created by the recorded
April `ALTER FUNCTION ... SET SCHEMA`, not an early prerequisite. Only its public
signature is therefore supplied early; the final snapshot restores both current
definitions. Creating both early caused a duplicate-function error and is corrected
without adapting or bypassing the historical schema move.

Run 36671479539 reached July's template overload search-path correction. Two old
JSONB overloads are absent both from recorded CREATE statements and current
production; the August migration explicitly drops them. CI guards only their exact
ALTER statements if absent, preserving search-path hardening for existing versions.
Current text-array signatures are supplied immediately before the July consumer,
since their first recorded CREATE is August. Other unrecorded functions with no
historical consumers are supplied by the final snapshot, rather than created too
early. In particular, write_full_meal_plan_storage is created by an August rename
and is not precreated. No user journeys run on intermediate historical states.

Run 36672023738 reached August's policy-consolidation guard and exposed five
base policies whose manual creation/consolidation was never recorded. The guard
remains unchanged. Three ALL predicates are reconstructed from the matching
preserved INSERT/UPDATE/DELETE predicates, and two SELECT predicates remove only
the episode branch that this recorded migration adds back. CI also restores the
complete 244-policy current snapshot after the recorded history. Every role,
command, permissive/restrictive mode and predicate comes from production metadata,
and is independently compared. This captures existing authorization, including
known weaknesses for Wave 05; it does not change permissions in production or
declare security findings fixed.

Run 36672831599 passed the policy foundations and reached September's 581-row
TACO repair. That migration depends on a manually populated import staging table
and existing public reference rows; neither was recorded. CI supplies 581 explicitly
INVENTED food fixtures and payloads with no external API calls. The original row
count, ID/status and update-count guards execute unchanged. A following assertion
checks all 581 transformed macro/sentinel values and removes only those invented
fixtures before later history. This proves the mechanical repair, not scientific
nutrition accuracy. These CI-only fixtures must never be pushed to a hosted project.
The runner OS is pinned to Ubuntu 24.04 instead of a moving major-version label.
