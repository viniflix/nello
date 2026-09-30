import { adaptManagedStorageSnapshot } from './storage-compatibility.mjs';

export const legacyBugPolicyRename = 'alter policy "Users can insert bug reports" on public.bug_reports\n  rename to "Users can insert bug reports (deprecated)";';
export const obsoleteTemplateSignatures = [
  'public.create_diet_template(uuid, text, text, jsonb, jsonb)',
  'public.update_diet_template(uuid, uuid, text, text, jsonb, jsonb)',
];
export const pollockRepairEntry = 'BEGIN\n  PERFORM pg_advisory_xact_lock(2026092301);';

// CI-only: this table and its old policy were created outside recorded migrations.
// The same recorded migration creates the replacement policy and drops the renamed
// deprecated one. Only the obsolete rename is guarded; all permission DDL is retained.
export function adaptAppliedHistory(file, source) {
  let result = adaptManagedStorageSnapshot(file, source);
  if (file === '20260923010000_recalculate_historical_pollock.sql') {
    if (result.split(pollockRepairEntry).length !== 2) throw Error('Unexpected historical Pollock repair entry');
    // A clinical data repair has no input on a fresh metadata-only reconstruction.
    // Any nonempty clinical table still executes ALL original partial/source guards.
    return result.replace(pollockRepairEntry, `BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.growth_records) THEN
    RAISE NOTICE 'CI reconstruction: historical Pollock data repair has no clinical input';
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(2026092301);`);
  }
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
