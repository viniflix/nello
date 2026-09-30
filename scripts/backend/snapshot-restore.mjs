import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from '../qa/isolated-runtime.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { applicationRestoreList } from './restore-list.mjs';
import { defaultOwnerAclSql } from './restore-acl.mjs';

export function restoreApplicationSnapshot({ execute = execFileSync } = {}) {
  assertIsolatedRuntime();
  const container = 'supabase_db_nello-reconstruction';
  const output = '.backend-ci/restore-results';
  mkdirSync(output, { recursive: true });
  const docker = (command, args, options = {}) => {
    const { user = 'supabase_admin', ...execution } = options;
    return execute('docker', ['exec', ...(execution.input ? ['-i'] : []),
      '-e', 'PGPASSWORD=postgres', container, command, '-h', '127.0.0.1', '-U', user, ...args],
      { timeout: 120000, maxBuffer: 64 * 1024 * 1024, ...execution });
  };
  const sql = (database, statement, user = 'supabase_admin') => docker('psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
    '-v', 'VERBOSITY=verbose', '-d', database], { input: statement, encoding: 'utf8', user });
  const guard = sql('postgres', "select current_user || ':' || ((select count(*) from auth.users)+(select count(*) from public.user_profiles)+(select count(*) from public.clinical_records)+(select count(*) from public.growth_records))::text;").trim();
  if (guard !== 'supabase_admin:0') throw Error('Refusing snapshot: wrong executor or reconstruction contains account/clinical rows');
  // This dump comes only from the credential-free reconstruction. It is not
  // uploaded as an artifact: only exclusions and independent metadata comparison are.
  const dumpFile = '.backend-ci/isolated-reconstruction.dump';
  writeFileSync(dumpFile, docker('pg_dump', ['-Fc', '--exclude-schema=cron', '-d', 'postgres']));
  execute('docker', ['cp', dumpFile, `${container}:/tmp/nello-qa.dump`]);
  const toc = docker('pg_restore', ['--list', '/tmp/nello-qa.dump'], { encoding: 'utf8' });
  const list = applicationRestoreList(toc);
  writeFileSync(path.join(output, 'restore.list'), list.text);
  writeFileSync(path.join(output, 'restore-exclusions.json'), JSON.stringify({
    reason: 'The single-database provider scheduler remains in postgres. Application QA clones do not run cron.',
    excludedSchema: 'cron', excludedEntries: list.excluded,
    scope: 'Complete application catalog, ownership, grants, RLS, policies, functions and buckets. No production data restore.',
  }, null, 2));
  execute('docker', ['cp', path.join(output, 'restore.list'), `${container}:/tmp/nello-qa.list`]);
  const template = 'nello_qa_wave02_template';
  sql('postgres', `CREATE DATABASE ${template} TEMPLATE template0 OWNER supabase_admin;`);
  // File input keeps the original restore error, avoiding a secondary stdin EPIPE.
  docker('pg_restore', ['--exit-on-error', '--use-list=/tmp/nello-qa.list', '-d', template, '/tmp/nello-qa.dump']);
  // Use the same metadata reader as the original reconstruction. SQL deparsers
  // qualify auth.uid()/auth.users differently under supabase_admin's search_path.
  const sourcePath = sql('postgres', 'SHOW search_path;', 'postgres').trim();
  const restoredPath = sql(template, 'SHOW search_path;', 'postgres').trim();
  writeFileSync(path.join(output, 'metadata-context.json'), JSON.stringify({ user: 'postgres', sourcePath, restoredPath }, null, 2));
  if (sourcePath !== restoredPath) throw Error('Source and restored metadata search_path differ');
  const aclSql = defaultOwnerAclSql(JSON.parse(readFileSync('operations/backend/production-catalog.json', 'utf8')), template);
  writeFileSync(path.join(output, 'materialize-default-owner-acl.sql'), aclSql);
  sql(template, aclSql, 'postgres');
  writeFileSync(path.join(output, 'restored-catalog.json'), sql(template, readFileSync('scripts/backend/catalog.sql', 'utf8'), 'postgres'));
  execute(process.execPath, ['scripts/backend/compare-catalog.mjs', 'operations/backend/production-catalog.json',
    path.join(output, 'restored-catalog.json'), path.join(output, 'restore-catalog-diff.json')], { stdio: 'inherit' });
  writeFileSync(path.join(output, 'result.json'), JSON.stringify({ capturedAt: new Date().toISOString(),
    applicationCatalogMatched: true, database: template, productionData: false, guard,
  }, null, 2));
  return { docker, sql, template };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  restoreApplicationSnapshot();
}
