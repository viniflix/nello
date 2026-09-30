import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs = [];
afterEach(() => dirs.splice(0).forEach((dir) => {
  readdirSync(dir).forEach((file) => unlinkSync(join(dir, file)));
  rmdirSync(dir);
}));
function compare(expected, actual) {
  const dir = mkdtempSync(join(tmpdir(), 'nello-catalog-'));
  dirs.push(dir);
  const a = join(dir, 'expected.json'), b = join(dir, 'actual.json'), diff = join(dir, 'diff.json');
  writeFileSync(a, JSON.stringify(expected)); writeFileSync(b, JSON.stringify(actual));
  const result = spawnSync(process.execPath, ['scripts/backend/compare-catalog.mjs', a, b, diff], { encoding: 'utf8' });
  return { ...result, differences: JSON.parse(readFileSync(diff, 'utf8')) };
}
describe('backend catalog promotion gate', () => {
  it('accepts identical metadata', () => {
    expect(compare({ policies: [{ roles: ['authenticated'], qual: 'auth.uid() = id' }] }, { policies: [{ roles: ['authenticated'], qual: 'auth.uid() = id' }] }).status).toBe(0);
  });
  it.each([
    ['policies', { roles: ['authenticated'], qual: 'auth.uid() = id' }, { roles: ['anon'], qual: 'true' }],
    ['buckets', { id: 'clinical', public: false }, { id: 'clinical', public: true }],
    ['functions', { definer: true, grants: 'authenticated=X' }, { definer: true, grants: '=X' }],
    ['columnGrants', { column: 'is_admin', grants: 'postgres=w/postgres' }, { column: 'is_admin', grants: 'authenticated=w/postgres' }],
  ])('blocks unsafe %s drift and preserves diagnostics', (key, expected, actual) => {
    const result = compare({ [key]: [expected] }, { [key]: [actual] });
    expect(result.status).toBe(1);
    expect(result.differences[0]).toEqual({ section: key, missing: [expected], extra: [actual] });
  });
  it('blocks a missing section', () => {
    expect(compare({ triggers: [{ name: 'on_auth_user_created' }] }, {}).status).toBe(1);
  });
  it('accepts aggregation/ACL/publication column ordering without ignoring rights', () => {
    expect(compare({ realtime: [{ columns: ['id', 'name'] }], schemas: [{ grants: '{=U/postgres,anon=U/postgres}' }], columns: [{ name: 'id' }, { name: 'name' }] },
      { realtime: [{ columns: ['name', 'id'] }], schemas: [{ grants: '{anon=U/postgres,=U/postgres}' }], columns: [{ name: 'name' }, { name: 'id' }] }).status).toBe(0);
    expect(compare({ schemas: [{ grants: '{=U/postgres,anon=U/postgres}' }] }, { schemas: [{ grants: '{anon=UC/postgres,=U/postgres}' }] }).status).toBe(1);
  });
  it('blocks unexpected sections and duplicate or missing publication columns', () => {
    expect(compare({}, { columnGrants: [{ grants: '=w' }] }).status).toBe(1);
    expect(compare({ columns: [{ name: 'id' }] }, { columns: [{ name: 'id' }, { name: 'id' }] }).status).toBe(1);
    expect(compare({ realtime: [{ columns: ['id', 'name'] }] }, { realtime: [{ columns: ['id', 'id'] }] }).status).toBe(1);
  });
  it('preserves ordered search paths and enum positions', () => {
    expect(compare({ functions: [{ config: ['search_path=public, private'] }] }, { functions: [{ config: ['search_path=private, public'] }] }).status).toBe(1);
    expect(compare({ enums: [{ label: 'Nello', order: 7 }] }, { enums: [{ label: 'Nello', order: 6 }] }).status).toBe(1);
  });
});
