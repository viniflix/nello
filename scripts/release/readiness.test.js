import { describe, it, expect } from 'vitest';
import { assertReleaseReady } from './readiness.mjs';

const sha = 'a'.repeat(40);
function evidence() {
  const projectId = 'prj_zbE0dJoJrygKzMBq6nG9o7NdVV3H';
  return { sha, project: { id: projectId }, candidateDeployment: {
    projectId, readyState: 'READY', meta: { githubCommitSha: sha },
  }, github: {
    checks: ['verify', 'reconstruct', 'Vercel installation regression'].map(name => ({ name, status: 'completed', conclusion: 'success' })),
    runs: [{ status: 'completed', conclusion: 'success' }],
  } };
}

describe('promotion after the exact candidate is validated', () => {
  it('approves a finished, matching candidate', () => expect(assertReleaseReady(evidence(), sha)).toBe(true));
  it.each(['ERROR', 'BUILDING', 'QUEUED', 'CANCELED'])('blocks Vercel state %s even when all GitHub jobs pass', state => {
    const input = evidence(); input.candidateDeployment.readyState = state;
    expect(() => assertReleaseReady(input, sha)).toThrow('READY');
  });
  it('blocks a ready deployment from another commit', () => {
    const input = evidence(); input.candidateDeployment.meta.githubCommitSha = 'b'.repeat(40);
    expect(() => assertReleaseReady(input, sha)).toThrow('Exact candidate');
  });
  it.each(['failure', 'cancelled', 'skipped'])('blocks incomplete or rejected backend checks: %s', conclusion => {
    const input = evidence(); input.github.checks[1].conclusion = conclusion;
    expect(() => assertReleaseReady(input, sha)).toThrow('reconstruct');
  });
  it('blocks a workflow still running even when its checks appear green', () => {
    const input = evidence(); input.github.runs[0].status = 'in_progress';
    expect(() => assertReleaseReady(input, sha)).toThrow('workflows');
  });
  it('blocks missing install regression and evidence from another project', () => {
    const input = evidence(); input.github.checks.pop();
    expect(() => assertReleaseReady(input, sha)).toThrow('installation regression');
    expect(() => assertReleaseReady({ ...evidence(), project: { id: 'other' } }, sha)).toThrow('project');
  });
});
