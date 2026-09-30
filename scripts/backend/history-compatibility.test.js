import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaptAppliedHistory, legacyBugPolicyRename, obsoleteTemplateSignatures } from './history-compatibility.mjs';

const file = '20260324201639_hardening_bug_reports_policies.sql';
describe('unrecorded obsolete policy reconstruction', () => {
  it('preserves all statements outside the obsolete rename', () => {
    const original = readFileSync(`supabase/migrations/applied/${file}`, 'utf8').replaceAll('\r\n', '\n');
    const [before, after] = original.split(legacyBugPolicyRename);
    const adapted = adaptAppliedHistory(file, original);
    expect(adapted.startsWith(before)).toBe(true);
    expect(adapted.endsWith(after)).toBe(true);
    expect(adapted).toContain('IF EXISTS (SELECT 1 FROM pg_policies');
    expect(adapted).toContain("tablename = 'bug_reports'");
    expect(adapted).toContain("EXECUTE '" + legacyBugPolicyRename + "'");
    expect(after).toContain('with check (');
    expect(after).toContain('DROP POLICY IF EXISTS "Users can insert bug reports (deprecated)"');
  });
  it('never adapts any other migration with the same text', () => {
    expect(adaptAppliedHistory('other.sql', legacyBugPolicyRename)).toBe(legacyBugPolicyRename);
  });
  it.each(['', legacyBugPolicyRename + '\n' + legacyBugPolicyRename])('rejects missing or duplicated rename instead of skipping errors', (source) => {
    expect(() => adaptAppliedHistory(file, source)).toThrow('Unexpected historical');
  });
});

describe('removed legacy template overloads', () => {
  const file = '20260711211123_fix_remaining_public_function_search_paths.sql';
  it('guards only two obsolete signatures, retaining hardening of current signatures', () => {
    let original = readFileSync(`supabase/migrations/applied/${file}`, 'utf8').replaceAll('\r\n', '\n');
    const adapted = adaptAppliedHistory(file, original);
    expect(adapted.match(/IF to_regprocedure/g)).toHaveLength(2);
    for (const signature of obsoleteTemplateSignatures) {
      const statement = `alter function ${signature} set search_path = public, pg_temp;`;
      expect(adapted).toContain(`EXECUTE '${statement}'`);
      original = original.replace(statement, '');
    }
    for (const statement of original.split('\n').filter(Boolean)) expect(adapted).toContain(statement);
    const removal = readFileSync('supabase/migrations/applied/20260813084601_d8_d9_plan_template_versioning.sql', 'utf8');
    for (const signature of obsoleteTemplateSignatures) expect(removal).toContain(`drop function if exists ${signature.replaceAll(' ', '')}`);
  });
  it('rejects unexpected legacy source', () => {
    expect(() => adaptAppliedHistory(file, '')).toThrow('Unexpected obsolete template');
  });
});
