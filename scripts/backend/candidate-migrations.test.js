// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { candidateChecksum, candidateMigrations } from './candidate-migrations.mjs';

describe('Git-canonical candidate checksums', () => {
  it('uses the committed LF representation for Windows and Linux checkouts', () => {
    expect(readFileSync('.gitattributes', 'utf8')).toContain('*.sql text eol=lf');
    const source = 'BEGIN;\nSELECT 1;\nCOMMIT;\n';
    const digest = createHash('sha256').update(source).digest('hex');
    expect(candidateChecksum(source.replaceAll('\n', '\r\n'))).toBe(digest);
    expect(candidateChecksum(Buffer.from(source))).toBe(digest);
    expect(candidateChecksum(source.replace('SELECT 1', 'SELECT 2'))).not.toBe(digest);
  });
  it('validates every pinned candidate against the canonical file Git publishes', () => {
    const candidates = candidateMigrations(); expect(candidates.length).toBeGreaterThan(0);
    for (const migration of candidates) {
      expect(migration.content).not.toContain('\r\n');
      expect(candidateChecksum(migration.content)).toBe(migration.sha256);
      expect(candidateChecksum(migration.content.replaceAll('\n', '\r\n'))).toBe(migration.sha256);
    }
  });
});
