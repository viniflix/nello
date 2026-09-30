import { describe, expect, it, vi } from 'vitest';
import { assertAtomicPair, assertRemoteDatabase, runRace } from './concurrency.mjs';

const environment = { CI: 'true', GITHUB_ACTIONS: 'true' };
const winner = { code: 0, output: 'COMMIT' };
const conflict = { code: 3, output: 'ERROR: 40001: amendment_chain_conflict' };
function harness({ waiting = '2', barrier = '1', outcomes = [winner, conflict] } = {}) {
  const sessions = [];
  const session = vi.fn(() => {
    let resolve;
    const done = new Promise(accept => { resolve = accept; });
    const result = sessions.length === 0 ? winner : outcomes[sessions.length - 1];
    const handle = { done, stop: vi.fn(() => resolve(result)), resolve: () => resolve(result) };
    sessions.push(handle);
    return handle;
  });
  const query = vi.fn((_database, statement) => {
    if (statement.includes('update public')) { sessions.forEach(handle => handle.resolve()); return ''; }
    return statement.includes('pg_locks') ? waiting : barrier;
  });
  return { session, query, sessions };
}
const scenario = { database: 'nello_qa_wave02_15', label: 'race', key: 91041,
  scripts: ['begin; __BARRIER__ commit;', 'begin; __BARRIER__ commit;'],
  environment, attempts: 2, sleep: async () => {} };

describe('isolated clinical amendment races', () => {
  it.each(['postgres', 'nello_qa_wave02_template', 'nello_qa_wave02_1; drop database postgres'])('rejects non-matrix database %s', database => {
    expect(() => assertRemoteDatabase(database, environment)).toThrow('synthetic');
  });
  it('rejects local execution before opening a session or querying', async () => {
    const dependencies = harness();
    await expect(runRace({ ...scenario, ...dependencies, environment: { CI: 'false' } })).rejects.toThrow('isolated GitHub');
    expect(dependencies.session).not.toHaveBeenCalled();
    expect(dependencies.query).not.toHaveBeenCalled();
  });
  it('proves simultaneous blocked sessions before releasing and checks both outcomes', async () => {
    const dependencies = harness();
    const evidence = await runRace({ ...scenario, ...dependencies });
    expect(evidence.overlappingSessions).toBe(2);
    const queries = dependencies.query.mock.calls.map(call => call[1]);
    expect(queries.findIndex(sql => sql.includes('pg_locks'))).toBeLessThan(queries.findIndex(sql => sql.includes('update public')));
    expect(dependencies.session.mock.calls.slice(1).every(call => call[1].includes('pg_advisory_xact_lock_shared(91041)'))).toBe(true);
    expect(dependencies.sessions.every(handle => handle.stop.mock.calls.length === 1)).toBe(true);
  });
  it('refuses serial execution and releases/stops every session on failure', async () => {
    const dependencies = harness({ waiting: '1' });
    await expect(runRace({ ...scenario, ...dependencies })).rejects.toThrow('did not overlap');
    expect(dependencies.query.mock.calls.some(call => call[1].includes('set release=true'))).toBe(true);
    expect(dependencies.sessions.every(handle => handle.stop.mock.calls.length === 1)).toBe(true);
  });
  it('cleans up when the barrier cannot become ready', async () => {
    const dependencies = harness({ barrier: '0' });
    await expect(runRace({ ...scenario, ...dependencies })).rejects.toThrow('did not acquire');
    expect(dependencies.session).toHaveBeenCalledTimes(1);
    expect(dependencies.sessions[0].stop).toHaveBeenCalledOnce();
  });
  it.each([
    [winner, winner], [conflict, conflict], [winner, { code: 3, output: 'permission denied 42501' }],
    [winner, { code: 3, output: '40001 unrelated conflict' }], [winner],
  ])('rejects outcomes that do not prove a unique atomic winner: %j', (...results) => {
    expect(() => assertAtomicPair('race', results)).toThrow('expected one winner');
  });
});
