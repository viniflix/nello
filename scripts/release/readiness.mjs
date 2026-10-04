import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertReleaseReady(evidence, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha) || evidence.sha !== sha) throw Error('Release evidence SHA mismatch');
  const age = Date.now() - Date.parse(evidence.capturedAt);
  if (!Number.isFinite(age) || age < -60000 || age > 15 * 60000) throw Error('Fresh provider evidence required (maximum age 15 minutes)');
  if (evidence.project?.id !== 'prj_zbE0dJoJrygKzMBq6nG9o7NdVV3H') throw Error('Wrong Vercel project');
  const deployment = evidence.candidateDeployment;
  if (deployment?.projectId !== evidence.project.id || deployment.meta?.githubCommitSha !== sha
      || deployment.readyState !== 'READY') throw Error('Exact candidate Vercel deployment must be READY');
  const required = ['verify', 'reconstruct', 'Vercel installation regression'];
  for (const name of required) {
    const check = evidence.github?.checks?.find(value => value.name === name);
    if (!check || check.status !== 'completed' || check.conclusion !== 'success') throw Error(`Required check is not green: ${name}`);
  }
  if (!evidence.github?.runs?.length || evidence.github.runs.some(run => run.status !== 'completed' || run.conclusion !== 'success')) {
    throw Error('All candidate GitHub workflows must finish successfully');
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sha = process.argv[2];
  const evidence = JSON.parse(readFileSync(process.argv[3], 'utf8').replace(/^\uFEFF/, ''));
  assertReleaseReady(evidence, sha);
  console.log(`Release ${sha} passed GitHub and Vercel readiness. Verify the direct main deployment on the canonical domain; production smoke remains required.`);
}
