# Migration sources

`applied/` contains the immutable SQL statements in the remote migration history,
ordered by the ACTUAL remote version. `operations/backend/baseline.json` records hashes.
Flat SQL files are historical local candidates; 118 had different versions from
production. They are preserved for review and existing test references, and are
excluded from reconstruction. Never concatenate or push both histories.

Future corrections belong in `releases/` with a unique timestamp after the baseline.
Do not change applied files to fix replay failures. Add a documented reconstruction
prerequisite when an initial snapshot omitted a Supabase-managed object, and prove
the resulting schema against the production catalog before promotion.

The root config disables migration replay intentionally. The preparation script
creates a separate Supabase workdir with only the authoritative history. It does
not link any remote project and rejects local execution unless explicitly requested
for preparation; starting containers is only allowed on a remote CI runner.
