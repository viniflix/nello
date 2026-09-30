// The February snapshot captured five vendor-owned prefix triggers. Supabase
// retired them in Storage migration 0052; current production has none of them.
// Only these exact statements are adapted. Application policies/grants are untouched.
export const managedTriggerStatements = [
  ['objects_delete_delete_prefix', 'delete_prefix_hierarchy_trigger', 'CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();'],
  ['objects_insert_create_prefix', 'objects_insert_prefix_trigger', 'CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();'],
  ['objects_update_create_prefix', 'objects_update_prefix_trigger', 'CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();'],
  ['prefixes_create_hierarchy', 'prefixes_insert_trigger', 'CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();'],
  ['prefixes_delete_hierarchy', 'delete_prefix_hierarchy_trigger', 'CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();'],
];
export function adaptManagedStorageSnapshot(file, source) {
  if (file !== '20260209212152_remote_schema.sql') return source;
  let result = source;
  for (const [name, fn, statement] of managedTriggerStatements) {
    if (result.split(statement).length !== 2) throw Error(`Unexpected vendor snapshot statement: ${name}`);
    const guarded = `-- Reconstruction compatibility: vendor-owned trigger ${name}\nDO $reconstruction$ BEGIN\n  IF to_regprocedure('storage.${fn}()') IS NOT NULL THEN\n    EXECUTE '${statement.replaceAll("'", "''")}';\n  END IF;\nEND $reconstruction$;`;
    result = result.replace(statement, guarded);
  }
  return result;
}
