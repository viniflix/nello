import { spawnSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

describe('remote-only source validation', () => {
  it.each(['scripts/backend/snapshot-restore.mjs', 'scripts/backend/edge-boot-smoke.mjs'])('refuses local service execution in %s', script => {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, CI: 'true', GITHUB_ACTIONS: 'false' }, encoding: 'utf8', timeout: 5000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('isolated GitHub runner');
    expect(result.stderr).not.toContain('spawnSync docker');
    expect(result.stderr).not.toContain('spawnSync npx');
  });
});
