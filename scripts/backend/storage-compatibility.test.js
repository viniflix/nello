import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { adaptManagedStorageSnapshot, managedTriggerStatements } from './storage-compatibility.mjs';
describe('managed Storage history adapter', () => {
  it('adapts exactly five retired vendor triggers and keeps every access policy intact', () => {
    const file = '20260209212152_remote_schema.sql';
    const sql = readFileSync(`supabase/migrations/applied/${file}`, 'utf8');
    const actual = adaptManagedStorageSnapshot(file, sql);
    expect(actual.match(/IF to_regprocedure/g)).toHaveLength(5);
    const prefix = sql.slice(0, sql.indexOf(managedTriggerStatements[0][2]));
    expect(actual.slice(0, prefix.length)).toBe(prefix);
    expect(actual.match(/create policy/gi)).toHaveLength(sql.match(/create policy/gi).length);
  });
  it('rejects a changed or missing known statement instead of broad filtering', () => {
    expect(() => adaptManagedStorageSnapshot('20260209212152_remote_schema.sql', 'CREATE POLICY private_access ON storage.objects USING (true);')).toThrow('Unexpected vendor snapshot');
  });
  it('never rewrites an unrelated migration', () => {
    const sql = 'CREATE POLICY private_access ON storage.objects USING (false);';
    expect(adaptManagedStorageSnapshot('20270101000000_security_fix.sql', sql)).toBe(sql);
  });
});
