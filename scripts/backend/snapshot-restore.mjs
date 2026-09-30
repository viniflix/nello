import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { applicationRestoreList } from './restore-list.mjs';

export function restoreApplicationSnapshot() {
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') {
    throw Error('Snapshot restore requires an isolated GitHub runner; local virtualization is prohibited.');
  }
  const container = 'supabase_db_nello-reconstruction';
  const output = '.backend-ci/restore-results';
  mkdirSync(output, { recursive: true });
  const docker = (command, args, options = {}) => execFileSync('docker', ['exec', ...(options.input ? ['-i'] : []),
    '-e', 'PGPASSWORD=postgres', container, command, '-h', '127.0.0.1', '-U', 'supabase_admin', ...args],
    { timeout: 120000, maxBuffer: 64 * 1024 * 1024, ...options });
  const sql = (database, statement) => docker('psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-v', 'VERBOSITY=verbose', '-d', database], { input: statement, encoding: 'utf8' });
  const guard = sql('postgres', "select current_user || ':' || ((select count(*) from auth.users)+(select count(*) from public.user_profiles)+(select count(*) from public.clinical_records)+(select count(*) from public.growth_records))::text;").trim();
  if (guard !== 'supabase_admin:0') throw Error('Refusing snapshot: wrong executor or reconstruction contains account/clinical rows');
  // This dump comes only from the credential-free reconstruction. It is not
  // uploaded as an artifact: only exclusions and independent metadata comparison are.
  const dumpFile = '.backend-ci/isolated-reconstruction.dump';
  writeFileSync(dumpFile, docker('pg_dump', ['-Fc', '--exclude-schema=cron', '-d', 'postgres']));
  execFileSync('docker', ['cp', dumpFile, `${container}:/tmp/nello-qa.dump`]);
  const toc = docker('pg_restore', ['--list', '/tmp/nello-qa.dump'], { encoding: 'utf8' });
  const list = applicationRestoreList(toc);
  writeFileSync(path.join(output, 'restore.list'), list.text);
  writeFileSync(path.join(output, 'restore-exclusions.json'), JSON.stringify({
    reason: 'The single-database provider scheduler remains in postgres. Application QA clones do not run cron.',
    excludedSchema: 'cron', excludedEntries: list.excluded,
    scope: 'Complete application catalog, ownership, grants, RLS, policies, functions and buckets. No production data restore.',
  }, null, 2));
  execFileSync('docker', ['cp', path.join(output, 'restore.list'), `${container}:/tmp/nello-qa.list`]);
  const template = 'nello_qa_wave02_template';
  sql('postgres', `CREATE DATABASE ${template} TEMPLATE template0 OWNER supabase_admin;`);
  // File input keeps the original restore error, avoiding a secondary stdin EPIPE.
  docker('pg_restore', ['--exit-on-error', '--use-list=/tmp/nello-qa.list', '-d', template, '/tmp/nello-qa.dump']);
  writeFileSync(path.join(output, 'restored-catalog.json'), sql(template, readFileSync('scripts/backend/catalog.sql', 'utf8')));
  execFileSync(process.execPath, ['scripts/backend/compare-catalog.mjs', 'operations/backend/production-catalog.json',
    path.join(output, 'restored-catalog.json'), path.join(output, 'restore-catalog-diff.json')], { stdio: 'inherit' });
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ capturedAt: new Date().toISOString(),
    applicationCatalogMatched: true, database: template, productionData: false, guard,
  }, null, 2));
  return { docker, sql, template };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  restoreApplicationSnapshot();
}
