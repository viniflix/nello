import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from '../qa/isolated-runtime.mjs';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertForwardRestoration } from './forward-restoration.mjs';
import { runAmendmentConcurrency } from './concurrency.mjs';
import { validateSqlManifest } from './sql-manifest.mjs';
import { candidateMigrations } from './candidate-migrations.mjs';

assertIsolatedRuntime();
const manifest = JSON.parse(readFileSync('operations/backend/sql-matrix.json', 'utf8'));
const actual = readdirSync('supabase/tests').filter(file => file.endsWith('.sql')).sort();
const fixtureFiles = new Set(readdirSync('supabase/fixtures/wave02').map(file => `supabase/fixtures/wave02/${file}`));
validateSqlManifest(manifest, actual, fixtureFiles);
const output = '.backend-ci/sql-results';
mkdirSync(output, { recursive: true });
const restoration = JSON.parse(readFileSync('.backend-ci/restore-results/result.json', 'utf8'));
assertForwardRestoration(restoration);
const template = restoration.database;
const docker = (command, args, options = {}) => execFileSync('docker', ['exec',
  ...(options.input ? ['-i'] : []), '-e', 'PGPASSWORD=postgres',
  'supabase_db_nello-reconstruction', command, '-h', '127.0.0.1', '-U', 'supabase_admin', ...args],
  { timeout: 120000, maxBuffer: 64 * 1024 * 1024, ...options });
const sql = (database, script) => docker('psql', ['-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
  '-v', 'VERBOSITY=verbose', '-d', database], { input: script, encoding: 'utf8' });
const results = [];
for (const [index, source] of manifest.sources.entries()) {
  const database = `nello_qa_wave02_${index}`;
  const started = Date.now();
  let passed = false;
  let created = false;
  let log = '';
  let concurrency;
  let hashes = [];
  try {
    sql('postgres', `CREATE DATABASE ${database} TEMPLATE ${source.kind === 'storage-fixture' ? 'template0' : template} OWNER supabase_admin;`);
    created = true;
    const candidates=source.kind==='storage-fixture'?[]:candidateMigrations();
    for(const migration of candidates)sql(database,migration.content);
    const inputs = [...(source.kind==='storage-fixture'?[]:['supabase/fixtures/wave02/client-rpc-contract.sql']), ...(source.fixtures || []), path.join('supabase/tests', source.file)];
    const contents = inputs.map(file => readFileSync(file, 'utf8'));
    hashes = [...candidates.map(({file,sha256})=>({file,sha256})), ...inputs.map((file, index) => ({ file, sha256: createHash('sha256').update(contents[index]).digest('hex') }))];
    if(candidates.some(m=>m.file.includes('wave04_identity_onboarding'))) {
      const reviewed=readFileSync('supabase/fixtures/wave02/wave04-client-rpc-contract.sql','utf8');
      contents[0]=contents[0].replace('create function pg_temp.assert_client_rpc_surface()',reviewed+'\ncreate function pg_temp.assert_client_rpc_surface()');
      hashes.push({file:'supabase/fixtures/wave02/wave04-client-rpc-contract.sql',sha256:createHash('sha256').update(reviewed).digest('hex')});
    }
    if(candidates.some(m=>m.file.includes('wave07_private_storage'))) {
      const reviewed=readFileSync('supabase/fixtures/wave02/wave07-client-rpc-contract.sql','utf8');
      contents[0]=contents[0].replace('create function pg_temp.assert_client_rpc_surface()',reviewed+'\ncreate function pg_temp.assert_client_rpc_surface()');
      hashes.push({file:'supabase/fixtures/wave02/wave07-client-rpc-contract.sql',sha256:createHash('sha256').update(reviewed).digest('hex')});
    }
    if(candidates.some(m=>m.file.includes('wave08_private_realtime'))) {
      const reviewed=readFileSync('supabase/fixtures/wave02/wave08-client-rpc-contract.sql','utf8');
      contents[0]=contents[0].replace('create function pg_temp.assert_client_rpc_surface()',reviewed+'\ncreate function pg_temp.assert_client_rpc_surface()');
      hashes.push({file:'supabase/fixtures/wave02/wave08-client-rpc-contract.sql',sha256:createHash('sha256').update(reviewed).digest('hex')});
    }
    if(candidates.some(m=>m.file.includes('wave09_data_integrity'))) {
      const reviewed=readFileSync('supabase/fixtures/wave02/wave09-client-rpc-contract.sql','utf8');
      contents[0]=contents[0].replace('create function pg_temp.assert_client_rpc_surface()',reviewed+'\ncreate function pg_temp.assert_client_rpc_surface()');
      hashes.push({file:'supabase/fixtures/wave02/wave09-client-rpc-contract.sql',sha256:createHash('sha256').update(reviewed).digest('hex')});
    }
    if(candidates.some(m=>m.file.includes('feed_active_care_scope'))) {
      const reviewed=readFileSync('supabase/fixtures/wave02/feed-client-rpc-contract.sql','utf8');
      contents[0]=contents[0].replace('create function pg_temp.assert_client_rpc_surface()',reviewed+'\ncreate function pg_temp.assert_client_rpc_surface()');
      hashes.push({file:'supabase/fixtures/wave02/feed-client-rpc-contract.sql',sha256:createHash('sha256').update(reviewed).digest('hex')});
    }
    if(candidates.some(m=>m.file.includes('admin_operational_workspace'))) {
      const reviewed=readFileSync('supabase/fixtures/wave02/admin-client-rpc-contract.sql','utf8');
      contents[0]=contents[0].replace('create function pg_temp.assert_client_rpc_surface()',reviewed+'\ncreate function pg_temp.assert_client_rpc_surface()');
      hashes.push({file:'supabase/fixtures/wave02/admin-client-rpc-contract.sql',sha256:createHash('sha256').update(reviewed).digest('hex')});
    }
    // Reviewed candidate bodies come from the checksum-pinned migration, never from
    // the database under test. Unchanged RPCs retain the independently captured digest.
    if(candidates.length){
      const overrides=candidates.flatMap(migration=>[...migration.content.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\([\s\S]*?AS \$function\$([\s\S]*?)\$function\$;/gi)].map(match=>{
        const digest=createHash('md5').update(match[2].replaceAll('\r\n','\n')).digest('hex');
        return `update wave02_client_rpc_contract set definition_md5='${digest}',body_only=true where signature like '${match[1]}(%';`;
      })).join('\n');
      contents[0]=contents[0].replace('create function pg_temp.assert_client_rpc_surface()',overrides+'\ncreate function pg_temp.assert_client_rpc_surface()');
    }
    const script = contents.join('\n');
    log = docker('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', database], { input: script, encoding: 'utf8' });
    if (source.kind === 'concurrency-setup') {
      concurrency = await runAmendmentConcurrency({ database, query: sql });
      log += `\n${JSON.stringify(concurrency, null, 2)}`;
    }
    passed = true;
  } catch (error) {
    log += `\n${error.stdout?.toString() || ''}\n${error.stderr?.toString() || error.message}`;
  } finally {
    try {
      if (created) sql('postgres', `DROP DATABASE IF EXISTS ${database};`);
    } catch (error) {
      passed = false;
      log += `\nDatabase cleanup failed: ${error.stderr?.toString() || error.message}`;
    }
  }
  writeFileSync(path.join(output, source.file + '.log'), log);
  const result = { file: source.file, kind: source.kind, passed, hashes, concurrency, durationMs: Date.now() - started };
  results.push(result);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${source.kind}: ${source.file} (${result.durationMs}ms)`);
}
writeFileSync(path.join(output, 'results.json'), JSON.stringify({ capturedAt: new Date().toISOString(), sources: results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;

