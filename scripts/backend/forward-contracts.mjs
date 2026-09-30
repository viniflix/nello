import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { assertForwardRestoration } from './forward-restoration.mjs';

if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') {
  throw Error('Forward contracts require an isolated GitHub runner; local virtualization is prohibited.');
}
const restoration = JSON.parse(readFileSync('.backend-ci/restore-results/result.json','utf8'));
assertForwardRestoration(restoration);
const database = 'nello_qa_wave02_100';
const container = 'supabase_db_nello-reconstruction';
const output = '.backend-ci/forward-results';
mkdirSync(output,{ recursive:true });
const sql = (target,script) => execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres',container,
  'psql','-X','-h','127.0.0.1','-U','supabase_admin','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-d',target],
  { input:script,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024 });
const fixture = readFileSync('supabase/fixtures/wave02/clinical-attachments.sql','utf8');
const check = readFileSync('operations/backend/checks/anamnesis-detachment.sql','utf8');
const contract = JSON.parse(readFileSync('operations/backend/forward-contracts.json','utf8'));
const migrationPath = contract.detachment.file;
if (contract.schemaVersion !== 1 || !/^supabase\/migrations\/(releases|applied)\/\d{14}_fail_closed_anamnesis_detachment\.sql$/.test(migrationPath)) {
  throw Error('Invalid forward contract migration source.');
}
const migration = readFileSync(migrationPath,'utf8');
const archived = readFileSync('supabase/reconstruction/20260924231756_live_function_baseline.sql','utf8')
  .match(/CREATE OR REPLACE FUNCTION public\.detach_anamnesis_file\([\s\S]*?\$function\$;/)?.[0];
if (!archived) throw Error('Missing independently captured original detachment definition.');
let evidence = '';
try {
  sql('postgres',`CREATE DATABASE ${database} TEMPLATE ${restoration.database} OWNER supabase_admin;`);
  evidence += sql(database,fixture);
  // Recreate the archived definition only in this disposable clone, even after
  // production's forward migration enters the authoritative applied history.
  evidence += sql(database,archived);
  // Expected baseline behavior is a reproducer, never candidate approval.
  evidence += sql(database,'\\set expect_fixed 0\n'+check);
  evidence += sql(database,migration);
  evidence += sql(database,'\\set expect_fixed 1\n'+check);
  writeFileSync(output+'/result.json',JSON.stringify({ capturedAt:new Date().toISOString(),
    baselineReproduced:true,candidatePassed:true,scenariosPerPhase:15,productionData:false,
    migration:migrationPath,sha256:createHash('sha256').update(migration).digest('hex') },null,2));
  console.log('Forward detachment contract: baseline reproduced; all 15 candidate scenarios passed.');
} catch(error) {
  evidence += `\n${error.stdout?.toString() || ''}\n${error.stderr?.toString() || error.message}`;
  process.exitCode=1;
} finally {
  writeFileSync(output+'/detachment.log',evidence);
  sql('postgres',`DROP DATABASE IF EXISTS ${database};`);
}
