import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('remote SQL matrix execution boundary', () => {
  it.each([
    { CI: 'false', GITHUB_ACTIONS: 'false' },
    { CI: 'true', GITHUB_ACTIONS: 'false' },
    { CI: 'false', GITHUB_ACTIONS: 'true' },
  ])('refuses local/partial CI environments before calling Docker', environment => {
    const result = spawnSync(process.execPath, ['scripts/backend/sql-matrix.mjs'], {
      env: { ...process.env, ...environment, DATABASE_URL: 'https://production.example.invalid' },
      encoding: 'utf8', timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('isolated GitHub runner');
    expect(result.stderr).not.toContain('spawnSync docker');
  });
});
