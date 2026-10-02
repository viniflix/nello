import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateSqlManifest } from './sql-manifest.mjs';

const source = { file: 'example.sql', kind: 'assertion-suite', fixtures: [] };
const manifest = sources => ({ schemaVersion: 1, sources });
const fixtures = new Set(['supabase/fixtures/wave02/clinical-attachments.sql']);
describe('complete SQL source classification', () => {
  it('validates the actual repository manifest against every SQL source and fixture', () => {
    const actual = readdirSync('supabase/tests').filter(file => file.endsWith('.sql'));
    const fixtureFiles = new Set(readdirSync('supabase/fixtures/wave02').map(file => `supabase/fixtures/wave02/${file}`));
    const configured = JSON.parse(readFileSync('operations/backend/sql-matrix.json', 'utf8'));
    expect(validateSqlManifest(configured, actual, fixtureFiles)).toBe(configured);
    expect(actual).toHaveLength(44);
    expect(configured.sources.filter(source => source.kind === 'assertion-suite')).toHaveLength(41);
  });
  it.each([[], [source, source], [{ ...source, file: 'other.sql' }]])('blocks omissions, duplicates and renamed sources: %j', (...sources) => {
    expect(() => validateSqlManifest(manifest(sources), ['example.sql'], fixtures)).toThrow();
  });
  it('blocks a newly added source until it is classified', () => {
    expect(() => validateSqlManifest(manifest([source]), ['example.sql', 'new.sql'], fixtures)).toThrow('Unclassified');
  });
  it.each(['stage2_only', 'stage3_only', 'stage4_only', 'ON_ERROR_STOP'])('blocks partial execution variable %s', key => {
    expect(() => validateSqlManifest(manifest([{ ...source, variables: { [key]: '1' } }]), ['example.sql'], fixtures)).toThrow('Partial execution');
  });
  it.each(['../secret.sql', 'supabase/migrations/live.sql', 'supabase/fixtures/wave02/missing.sql'])('blocks invalid or missing fixture %s', fixture => {
    expect(() => validateSqlManifest(manifest([{ ...source, fixtures: [fixture] }]), ['example.sql'], fixtures)).toThrow('fixture');
  });
  it.each(['inventory', 'storage-fixture', 'concurrency-setup', 'skip'])('cannot hide an assertion suite behind classification %s', kind => {
    expect(() => validateSqlManifest(manifest([{ ...source, kind }]), ['example.sql'], fixtures)).toThrow();
  });
});
