import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') {
  throw Error('SQL matrix requires an isolated GitHub runner; local virtualization is prohibited.');
}
const container = 'supabase_db_nello-reconstruction';
const manifest = JSON.parse(readFileSync('operations/backend/sql-matrix.json', 'utf8'));
const listed = manifest.sources.map(source => source.file).sort();
const actual = readdirSync('supabase/tests').filter(file => file.endsWith('.sql')).sort();
if (JSON.stringify(listed) !== JSON.stringify(actual)) throw Error('Unclassified SQL source; update the complete matrix manifest.');
const output = '.backend-ci/sql-results';
mkdirSync(output, { recursive: true });
const docker = (command, args, options = {}) => execFileSync('docker', ['exec', ...(options.input ? ['-i'] : []), '-e', 'PGPASSWORD=postgres', container, command, '-h', '127.0.0.1', '-U', 'supabase_admin', ...args], { timeout: 120000, maxBuffer: 64 * 1024 * 1024, ...options });
const sql = (database, statement) => docker('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-d', database], { input: statement, encoding: 'utf8' });
const guard = sql('postgres', "select current_user || ':' || ((select count(*) from auth.users)+(select count(*) from public.user_profiles)+(select count(*) from public.clinical_records)+(select count(*) from public.growth_records))::text;").trim().split(/\r?\n/).map(line => line.trim());
if (!guard.includes('supabase_admin:0')) throw Error('Refusing SQL tests: reconstruction contains account/clinical rows or wrong executor.');
// This dump is created from the credential-free reconstructed runner, never hosted data.
const dump = docker('pg_dump', ['-Fc', '-d', 'postgres']);
const template = 'nello_qa_wave02_template';
sql('postgres', `CREATE DATABASE ${template} TEMPLATE template0 OWNER supabase_admin;`);
docker('pg_restore', ['--exit-on-error', '-d', template], { input: dump });
const results = [];
for (const [index, source] of manifest.sources.entries()) {
  const database = `nello_qa_wave02_${index}`;
  const started = Date.now();
  let passed = false;
  let log = '';
  try {
    sql('postgres', `CREATE DATABASE ${database} TEMPLATE ${source.kind === 'storage-fixture' ? 'template0' : template} OWNER supabase_admin;`);
    const inputs = [...(source.fixtures || []), path.join('supabase/tests', source.file)];
    const script = inputs.map(file => readFileSync(file, 'utf8')).join('\n');
    const variables = Object.entries(source.variables || {}).flatMap(([key, value]) => ['-v', `${key}=${value}`]);
    log = docker('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', ...variables, '-d', database], { input: script, encoding: 'utf8' });
    if (source.kind === 'concurrency-setup') {
      throw Error('Concurrency companion validation not implemented yet; setup alone cannot approve a race test.');
    }
    passed = true;
  } catch (error) {
    log += `\n${error.stderr?.toString() || error.message}`;
  }
  writeFileSync(path.join(output, source.file + '.log'), log);
  const result = { file: source.file, kind: source.kind, passed, durationMs: Date.now() - started };
  results.push(result);
  console.log(`${passed ? 'PASS' : 'FAIL'} ${source.kind}: ${source.file} (${result.durationMs}ms)`);
}
writeFileSync(path.join(output, 'results.json'), JSON.stringify({ capturedAt: new Date().toISOString(), sources: results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
