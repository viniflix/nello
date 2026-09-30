import { adaptManagedStorageSnapshot } from './storage-compatibility.mjs';

export const legacyBugPolicyRename = 'alter policy "Users can insert bug reports" on public.bug_reports\n  rename to "Users can insert bug reports (deprecated)";';

// CI-only: this table and its old policy were created outside recorded migrations.
// The same recorded migration creates the replacement policy and drops the renamed
// deprecated one. Only the obsolete rename is guarded; all permission DDL is retained.
export function adaptAppliedHistory(file, source) {
  let result = adaptManagedStorageSnapshot(file, source);
  if (file !== '20260324201639_hardening_bug_reports_policies.sql') return result;
  if (result.split(legacyBugPolicyRename).length !== 2) throw Error('Unexpected historical bug-report policy rename');
  const guarded = `DO $reconstruction$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'bug_reports' AND policyname = 'Users can insert bug reports') THEN
    EXECUTE '${legacyBugPolicyRename.replaceAll("'", "''")}';
  END IF;
END $reconstruction$;`;
  return result.replace(legacyBugPolicyRename, guarded);
}
