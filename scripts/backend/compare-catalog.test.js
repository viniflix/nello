import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dirs = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
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
  ])('blocks unsafe %s drift and preserves diagnostics', (key, expected, actual) => {
    const result = compare({ [key]: [expected] }, { [key]: [actual] });
    expect(result.status).toBe(1);
    expect(result.differences[0]).toEqual({ section: key, missing: [expected], extra: [actual] });
  });
  it('blocks a missing section', () => {
    expect(compare({ triggers: [{ name: 'on_auth_user_created' }] }, {}).status).toBe(1);
  });
});
