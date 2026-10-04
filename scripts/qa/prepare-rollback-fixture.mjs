import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { assertIsolatedRuntime } from './isolated-runtime.mjs';
import { rollbackFunctionSource } from './rollback-contract.mjs';

export function registerRollbackFixture(config) {
  if (!config.includes('project_id = "nello-reconstruction"') || config.includes('[functions.qa-rollback-proof]')) throw Error('Unregistered disposable rollback configuration required');
  return `${config}\n[functions.qa-rollback-proof]\nverify_jwt = true\nentrypoint = "./functions/qa-rollback-proof/index.ts"\n`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertIsolatedRuntime();
  if (existsSync('.backend-ci/supabase/.temp/project-ref')) throw Error('Linked workdir refused');
  const config = '.backend-ci/supabase/config.toml';
  const registered = registerRollbackFixture(readFileSync(config, 'utf8'));
  mkdirSync('.backend-ci/supabase/functions/qa-rollback-proof', {recursive:true});
  writeFileSync('.backend-ci/supabase/functions/qa-rollback-proof/index.ts', rollbackFunctionSource(1));
  writeFileSync(config,registered);
  console.log('Synthetic rollback function registered before isolated runtime startup; JWT verification remains enabled.');
}
