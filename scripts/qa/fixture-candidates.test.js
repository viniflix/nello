// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { applyFixtureCandidates } from './fixture-candidates.mjs';

const content = 'select 1;';
const migration = { file: 'supabase/migrations/releases/20260930155500_candidate.sql', content,
  sha256: createHash('sha256').update(content).digest('hex') };
it('does not replay an already applied, byte-verified candidate and blocks a tampered copy', () => {
  const sql = vi.fn(() => '1');
  applyFixtureCandidates(sql, [migration], () => Buffer.from(content));
  expect(sql).toHaveBeenCalledTimes(1);
  expect(() => applyFixtureCandidates(sql, [migration], () => Buffer.from('select 2;'))).toThrow('checksum');
  expect(sql.mock.calls.every(([statement]) => statement.startsWith('select count(*)'))).toBe(true);
});
it('applies absent candidates and rejects an invalid history result', () => {
  const sql = vi.fn(() => '0');
  applyFixtureCandidates(sql, [migration]);
  expect(sql).toHaveBeenLastCalledWith(content);
  expect(() => applyFixtureCandidates(() => '2', [migration])).toThrow('history');
});
it('recognizes an applied CRLF checkout using the committed LF checksum without replaying SQL', () => {
  const source = 'BEGIN;\nSELECT 1;\nCOMMIT;\n';
  const sql = vi.fn(() => '1');
  applyFixtureCandidates(sql, [{ ...migration, content: source, sha256: createHash('sha256').update(source).digest('hex') }], () => Buffer.from(source.replaceAll('\n', '\r\n')));
  expect(sql).toHaveBeenCalledTimes(1);
});
