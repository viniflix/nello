import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from '../qa/isolated-runtime.mjs';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, copyFileSync, cpSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { adaptAppliedHistory } from './history-compatibility.mjs';
import { prepareStorageWasmAssets } from './storage-wasm-assets.mjs';

const root = process.cwd();
prepareStorageWasmAssets();
const manifest = JSON.parse(readFileSync('operations/backend/baseline.json', 'utf8'));
const sha = (s) => createHash('sha256').update(s.replaceAll('\r\n', '\n')).digest('hex');
const source = resolve('supabase/migrations/applied');
const actual = readdirSync(source).filter((f) => f.endsWith('.sql')).sort();
const expected = manifest.migrations.map((m) => m.file);
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw Error('Applied migration list drift');
for (const m of manifest.migrations) {
  if (sha(readFileSync(join(source, m.file), 'utf8')) !== m.sha256) throw Error(`Applied migration checksum drift: ${m.file}`);
}
console.log(`Verified ${actual.length} immutable applied migrations.`);
const sharedActual = readdirSync(resolve('supabase/functions/_shared')).sort();
if (JSON.stringify(sharedActual) !== JSON.stringify((manifest.sharedFunctions || []).map(file => file.file).sort())) throw Error('Unreviewed shared Edge source');
for (const shared of manifest.sharedFunctions || []) {
  if (sha(readFileSync(resolve('supabase/functions/_shared', shared.file),'utf8')) !== shared.repositorySha256) throw Error(`Shared Edge source checksum drift: ${shared.file}`);
}
for (const fn of manifest.functions) {
  for (const f of fn.files) {
    if (sha(readFileSync(resolve('supabase/functions', fn.slug, f.file), 'utf8')) !== f.repositorySha256) {
      throw Error(`Edge source checksum drift: ${fn.slug}/${f.file}. Update release evidence explicitly.`);
    }
  }
}
const storageFunctions = JSON.parse(readFileSync('operations/backend/wave07-edge-functions.json', 'utf8'));
if (storageFunctions.schemaVersion !== 1 || !Array.isArray(storageFunctions.functions)) throw Error('Invalid Storage Edge release manifest');
for (const fn of storageFunctions.functions) {
  if (!['upload-private-file', 'storage-maintenance'].includes(fn.slug)) throw Error('Unexpected Storage Edge function');
  for (const file of fn.files) {
    if (sha(readFileSync(resolve('supabase/functions', fn.slug, file.file), 'utf8')) !== file.repositorySha256) throw Error(`Storage Edge checksum drift: ${fn.slug}/${file.file}`);
  }
}
if (process.argv.includes('--check')) process.exit(0);
assertIsolatedRuntime();
const destination = resolve('.backend-ci');
if (existsSync(destination)) throw Error('Refusing to overwrite an existing reconstruction workdir');
mkdirSync(join(destination, 'supabase/migrations'), { recursive: true });
const config = readFileSync('supabase/config.toml', 'utf8').replaceAll('\r\n','\n');
if (!config.includes('[db.migrations]\n#')) throw Error('Unexpected migration guard config');
writeFileSync(join(destination, 'supabase/config.toml'), config.replace(/(\[db\.migrations\][\s\S]*?)enabled = false/, '$1enabled = true'));
cpSync(resolve('supabase/functions'), join(destination, 'supabase/functions'), { recursive: true });
for (const file of actual) {
  const original = readFileSync(join(source, file), 'utf8');
  writeFileSync(join(destination, 'supabase/migrations', file), adaptAppliedHistory(file, original.replaceAll('\r\n', '\n')));
}
// CI-only dependencies of recorded history; never sent to a hosted project.
for (const file of readdirSync('supabase/reconstruction').filter((f) => f.endsWith('.sql')).sort()) {
  if (!/^\d{14}_\w+\.sql$/.test(file) || expected.includes(file)) throw Error(`Invalid reconstruction prerequisite: ${file}`);
  copyFileSync(resolve('supabase/reconstruction', file), join(destination, 'supabase/migrations', file));
}
const releaseDir = resolve('supabase/migrations/releases');
if (!process.argv.includes('--baseline-only') && existsSync(releaseDir)) {
  for (const file of readdirSync(releaseDir).filter((f) => f.endsWith('.sql')).sort()) {
    if (!/^\d{14}_\w+\.sql$/.test(file) || file.slice(0, 14) <= manifest.lastMigration) throw Error(`Invalid forward migration: ${file}`);
    copyFileSync(join(releaseDir, file), join(destination, 'supabase/migrations', file));
  }
}
console.log(`Prepared isolated, UNLINKED remote CI workdir: ${destination.replace(root, '.')}`);
