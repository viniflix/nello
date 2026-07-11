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

  it('rejects new legacy analytics imports', () => {
    const root = createRoot();
    const result = checkProjectStructure(root, ['src/pages/example.jsx'], [{
      path: 'src/pages/example.jsx',
      content: "import { track } from '@/analytics/posthog';",
    }]);
    expect(result.errors).toContain(
      'Legacy analytics import is not allowed in src/pages/example.jsx; use @/infrastructure/analytics/posthog',
    );
  });

  it('rejects unowned generic services but allows the legacy admin service', () => {
    const root = createRoot();
    const result = checkProjectStructure(root, [
      'src/services/adminService.js',
      'src/services/newService.js',
    ]);
    expect(result.errors).toContain(
      'Generic service has no domain owner: src/services/newService.js',
    );
    expect(result.errors).not.toContain(
      'Generic service has no domain owner: src/services/adminService.js',
    );
  });

  it('rejects SQL migrations outside the official Supabase directory', () => {
    const root = createRoot();
    const result = checkProjectStructure(root, [
      'supabase/migrations/20260711000000_valid.sql',
      'src/lib/supabase/migrations/unsafe.sql',
      'scripts/legacy_migration.sql',
    ]);

    expect(result.errors).toEqual([
      'SQL migration must live in supabase/migrations: src/lib/supabase/migrations/unsafe.sql',
      'SQL migration must live in supabase/migrations: scripts/legacy_migration.sql',
    ]);
  });
});
