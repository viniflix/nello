import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkProjectStructure } from './check-project-structure.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createRoot() {
  const root = mkdtempSync(join(tmpdir(), 'nello-structure-'));
  roots.push(root);
  mkdirSync(join(root, 'src'));
  mkdirSync(join(root, 'public'));
  writeFileSync(join(root, 'package.json'), '{}');
  return root;
}

describe('checkProjectStructure', () => {
  it('accepts the minimum project structure', () => {
    const root = createRoot();
    expect(checkProjectStructure(root, ['src/main.jsx', 'public/favicon.ico'])).toEqual({ errors: [] });
  });

  it('rejects tracked build output and root scratch scripts', () => {
    const root = createRoot();
    const result = checkProjectStructure(root, [
      'dist/assets/index.js',
      'scratch_update_templates.mjs',
    ]);
    expect(result.errors).toEqual([
      'Generated build output must not be tracked: dist/assets/index.js',
      'Temporary root file must not be tracked: scratch_update_templates.mjs',
    ]);
  });

  it('reports missing required directories', () => {
    const root = createRoot();
    rmSync(join(root, 'public'), { recursive: true });
    expect(checkProjectStructure(root, []).errors).toContain('Required path is missing: public');
  });
});
