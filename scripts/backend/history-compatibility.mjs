import { adaptManagedStorageSnapshot } from './storage-compatibility.mjs';

export const legacyBugPolicyRename = 'alter policy "Users can insert bug reports" on public.bug_reports\n  rename to "Users can insert bug reports (deprecated)";';
export const obsoleteTemplateSignatures = [
  'public.create_diet_template(uuid, text, text, jsonb, jsonb)',
  'public.update_diet_template(uuid, uuid, text, text, jsonb, jsonb)',
];

// CI-only: this table and its old policy were created outside recorded migrations.
// The same recorded migration creates the replacement policy and drops the renamed
// deprecated one. Only the obsolete rename is guarded; all permission DDL is retained.
export function adaptAppliedHistory(file, source) {
  let result = adaptManagedStorageSnapshot(file, source);
  if (file === '20260711211123_fix_remaining_public_function_search_paths.sql') {
    for (const signature of obsoleteTemplateSignatures) {
      const statement = `alter function ${signature} set search_path = public, pg_temp;`;
      if (result.split(statement).length !== 2) throw Error(`Unexpected obsolete template statement: ${signature}`);
      result = result.replace(statement, `DO $reconstruction$ BEGIN
  IF to_regprocedure('${signature}') IS NOT NULL THEN
    EXECUTE '${statement}';
  END IF;
END $reconstruction$;`);
    }
    return result;
  }
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
