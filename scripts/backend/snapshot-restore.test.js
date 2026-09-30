import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ calls: [], mismatch: false }));
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal();
  const fake = { mkdirSync: vi.fn(), writeFileSync: vi.fn(),
    readFileSync: (file) => file.endsWith('production-catalog.json') ? '{"relations":[]}' : 'SELECT catalog;' };
  return { ...original, ...fake, default: { ...original.default, ...fake } };
});
// Explicit injection guarantees these tests never invoke Docker or a child process.
const execute = (file, args, options) => {
  state.calls.push({ file, args, options });
  if (args.includes('pg_dump')) return Buffer.from('isolated dump');
  if (args.includes('--list')) return '6; 3079 17861 EXTENSION - pg_cron ';
  if (options?.input?.includes('current_user ||')) return 'supabase_admin:0\n';
  if (options?.input === 'SHOW search_path;') {
    return state.mismatch && args.includes('nello_qa_wave02_template') ? 'public, auth\n' : 'public, extensions\n';
  }
  if (options?.input === 'SELECT catalog;') return '{}';
  return '';
};
import { restoreApplicationSnapshot } from './snapshot-restore.mjs';
afterEach(() => { vi.unstubAllEnvs(); state.calls = []; state.mismatch = false; });
describe('snapshot metadata reader regression', () => {
  it('reads both contexts and the restored catalog as the same postgres reader', () => {
    vi.stubEnv('CI', 'true'); vi.stubEnv('GITHUB_ACTIONS', 'true');
    restoreApplicationSnapshot({ execute });
    const reads = state.calls.filter(c => ['SHOW search_path;', 'SELECT catalog;'].includes(c.options?.input));
    expect(reads).toHaveLength(3);
    for (const call of reads) expect(call.args[call.args.indexOf('-U') + 1]).toBe('postgres');
    const grants = state.calls.find(c => c.options?.input?.startsWith('DO $restore_acl$'));
    expect(grants.args).toContain('nello_qa_wave02_template');
    expect(grants.args[grants.args.indexOf('-U') + 1]).toBe('postgres');
    expect(state.calls.some(c => c.args.includes('scripts/backend/compare-catalog.mjs'))).toBe(true);
  });
  it('refuses mismatched search paths before ACL materialization or catalog acceptance', () => {
    vi.stubEnv('CI', 'true'); vi.stubEnv('GITHUB_ACTIONS', 'true'); state.mismatch = true;
    expect(() => restoreApplicationSnapshot({ execute })).toThrow('search_path differ');
    expect(state.calls.some(c => c.options?.input?.startsWith('DO $restore_acl$'))).toBe(false);
    expect(state.calls.some(c => c.args.includes('scripts/backend/compare-catalog.mjs'))).toBe(false);
  });
});
