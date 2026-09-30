import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
function run(expected, actual) {
  const dir = mkdtempSync(join(tmpdir(), 'nello-types-'));
  try {
    const a = join(dir, 'a.ts'), b = join(dir, 'b.ts');
    writeFileSync(a, expected); writeFileSync(b, actual);
    return spawnSync(process.execPath, ['scripts/backend/compare-types.mjs', a, b], { encoding: 'utf8' });
  } finally {
    readdirSync(dir).forEach((file) => unlinkSync(join(dir, file)));
    rmdirSync(dir);
  }
}
describe('generated database type gate', () => {
  it('accepts identical contracts with different comments and formatting', () => {
    expect(run('export type Row = { id: string }', '// generated\nexport type Row={id:string};').status).toBe(0);
  });
  it('allows only the provider PostgREST engine version difference', () => {
    expect(run('type Metadata={PostgrestVersion: "14.1"}', 'type Metadata={PostgrestVersion: "14.5"}').status).toBe(0);
  });
  it.each([
    ['nullability', 'export type Row={id:string}', 'export type Row={id:string|null}'],
    ['enum values', 'export type Source="TACO"', 'export type Source="CUSTOM"'],
    ['column shape', 'export type Row={id:string}', 'export type Row={id:number}'],
    ['invalid source', 'export type Row={id:string}', 'export type Row={'],
  ])('blocks %s drift', (_label, expected, actual) => {
    expect(run(expected, actual).status).not.toBe(0);
  });
});
