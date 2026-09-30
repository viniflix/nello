import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { restoreApplicationSnapshot } from './snapshot-restore.mjs';
import { runAmendmentConcurrency } from './concurrency.mjs';
import { validateSqlManifest } from './sql-manifest.mjs';

if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') {
  throw Error('SQL matrix requires an isolated GitHub runner; local virtualization is prohibited.');
}
const manifest = JSON.parse(readFileSync('operations/backend/sql-matrix.json', 'utf8'));
const actual = readdirSync('supabase/tests').filter(file => file.endsWith('.sql')).sort();
const fixtureFiles = new Set(readdirSync('supabase/fixtures/wave02').map(file => `supabase/fixtures/wave02/${file}`));
validateSqlManifest(manifest, actual, fixtureFiles);
const output = '.backend-ci/sql-results';
mkdirSync(output, { recursive: true });
const { docker, sql, template } = restoreApplicationSnapshot();
const results = [];
for (const [index, source] of manifest.sources.entries()) {
  const database = `nello_qa_wave02_${index}`;
  const started = Date.now();
  let passed = false;
  let log = '';
  let concurrency;
  let hashes = [];
  try {
    sql('postgres', `CREATE DATABASE ${database} TEMPLATE ${source.kind === 'storage-fixture' ? 'template0' : template} OWNER supabase_admin;`);
    const inputs = [...(source.fixtures || []), path.join('supabase/tests', source.file)];
    const contents = inputs.map(file => readFileSync(file, 'utf8'));
    hashes = inputs.map((file, index) => ({ file, sha256: createHash('sha256').update(contents[index]).digest('hex') }));
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
      sql('postgres', `DROP DATABASE IF EXISTS ${database};`);
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

