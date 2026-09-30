import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonicalConstraint } from './constraint-representation.mjs';
const nested = "CHECK ((((length(storage_path) >= 10) AND (length(storage_path) <= 500)) AND (storage_path ~ '^[A-Za-z0-9/_-]+$'::text)))";
const flat = "CHECK (((length(storage_path) >= 10) AND (length(storage_path) <= 500) AND (storage_path ~ '^[A-Za-z0-9/_-]+$'::text)))";
const row = { schema: 'public', table: 'clinical_attachments', name: 'clinical_attachments_path_check', definition: nested };
function compare(actual) {
  const dir = mkdtempSync(join(tmpdir(), 'nello-catalog-'));
  const expectedFile = join(dir, 'expected.json'), actualFile = join(dir, 'actual.json');
  try {
    writeFileSync(expectedFile, JSON.stringify({ constraints: [row] }));
    writeFileSync(actualFile, JSON.stringify({ constraints: [actual] }));
    return spawnSync(process.execPath, ['scripts/backend/compare-catalog.mjs', expectedFile, actualFile], { encoding: 'utf8' }).status;
  } finally { unlinkSync(expectedFile); unlinkSync(actualFile); rmdirSync(dir); }
}
describe('PostgreSQL CHECK dump/parser representation', () => {
  it('accepts only the captured associative AND grouping difference in the real gate', () => {
    expect(canonicalConstraint(row)).toEqual({ ...row, definition: flat });
    expect(compare({ ...row, definition: flat })).toBe(0);
    expect(row.definition).toBe(nested);
  });
  it.each([
    { definition: flat.replace('>= 10', '>= 1') },
    { definition: flat.replace('<= 500', '<= 5000') },
    { definition: flat.replace(' AND ', ' OR ') },
    { definition: flat.replace("'^[A-Za-z0-9/_-]+$'", "'.*'") },
    { definition: flat.replace(' ~ ', ' !~ ') },
    { definition: flat.replace('storage_path', 'other_path') },
    { definition: flat + ' NOT VALID' },
    { definition: flat + ' NO INHERIT' },
    { schema: 'private', definition: flat },
    { table: 'other_attachments', definition: flat },
    { name: 'other_check', definition: flat },
  ])('blocks semantic or identity drift rather than removing parentheses: %j', (change) => {
    const changed = { ...row, ...change };
    expect(canonicalConstraint(changed)).toEqual(changed);
    expect(compare(changed)).toBe(1);
  });
});
