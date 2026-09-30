import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { restoreApplicationSnapshot } from './snapshot-restore.mjs';

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
const { docker, sql, template } = restoreApplicationSnapshot();
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

