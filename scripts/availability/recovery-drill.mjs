import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { applicationRestoreList } from '../backend/restore-list.mjs';
import { defaultOwnerAclSql } from '../backend/restore-acl.mjs';
import { assertIsolatedRuntime } from '../qa/isolated-runtime.mjs';
import { assertSyntheticRecoveryIdentities } from '../qa/recovery-identities.mjs';

// This drill reads a disposable local stack and restores into a new database and
// new Auth/Storage containers. It never resets or writes the source application.
assertIsolatedRuntime();
if (process.env.NELLO_LOCAL_QA !== 'isolated') throw Error('Explicit local isolation required');
const suffix = randomBytes(6).toString('hex');
const database = `nello_wave03_recovery_${suffix}`;
const root = path.resolve('.codex/local/recovery', suffix);
mkdirSync(root, { recursive: true });
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json', 'utf8'));
const fixtureUrl = new URL(fixture.url);
const sourceProject = { '54321': 'nello-reconstruction', '55321': 'nello-wave03-qa' }[fixtureUrl.port];
if (fixtureUrl.protocol !== 'http:' || fixtureUrl.hostname !== 'localhost' || fixtureUrl.pathname !== '/' || !sourceProject) throw Error('Registered synthetic loopback fixture required');
const sourceContainer = `supabase_db_${sourceProject}`;
const services = [];
const storageVolume = `nello_wave03_storage_${suffix}`;
let volumeCreated = false;
const execute = (args, options = {}) => {
  try { return execFileSync('docker', args, { timeout: 120000, maxBuffer: 128 * 1024 * 1024, stdio: 'pipe', ...options }); }
  catch (error) {
    writeFileSync(path.join(root, 'failure.private.log'), error.stderr || 'Command failed', { mode: 0o600 });
    throw Error(`Isolated recovery command failed (${args[0]}); private diagnostic retained locally`);
  }
};
const sql = (db, statement, user = 'supabase_admin') => execute(['exec', '-i', '-e', 'PGPASSWORD=postgres', sourceContainer,
  'psql', '-X', '-h', '127.0.0.1', '-U', user, '-d', db, '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8' }).trim();
const inspect = name => JSON.parse(execute(['inspect', name], { encoding: 'utf8' }))[0];
const archiveImage = 'mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27';
const source = inspect(sourceContainer);
const network = `supabase_network_${sourceProject}`;
// Supabase CLI publishes the local DB on all host interfaces by default. Identify
// the disposable source by its CLI label, private network and fixed QA port;
// every database connection below runs inside that container on loopback.
if (!source.NetworkSettings.Networks[network]
  || source.Config.Labels?.['com.supabase.cli.project'] !== sourceProject
  || !source.NetworkSettings.Ports['5432/tcp']?.length
  || source.NetworkSettings.Ports['5432/tcp'].some(port => port.HostPort !== String(Number(fixtureUrl.port) + 1))) throw Error('Source is not the disposable CLI stack');
// Initial personas plus the UUID patients deliberately seeded by the clinical
// browser journeys. A generic example.invalid address is not enough to pass.
const authAccountsCompared = assertSyntheticRecoveryIdentities(JSON.parse(sql('postgres',
  "select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email)),'[]'::jsonb) from auth.users;")), fixture.personas);
if (sql('postgres', 'select count(*) from public.clinical_records;') === '0') throw Error('A real synthetic clinical record is required');
const digest = buffer => createHash('sha256').update(buffer).digest('hex');
const key = randomBytes(32), iv = randomBytes(12);
let outageAt;
try {
  const capturedAt = Date.now();
  const catalogQuery = readFileSync('scripts/backend/catalog.sql', 'utf8');
  const originalCatalog = sql('postgres', catalogQuery, 'postgres');
  const dump = execute(['exec', '-e', 'PGPASSWORD=postgres', sourceContainer, 'pg_dump', '-h', '127.0.0.1', '-U', 'supabase_admin', '-Fc', '--exclude-schema=cron', '-d', 'postgres']);
  // BusyBox tar in Storage cannot preserve xattrs. Use the pinned Ubuntu QA
  // tool image with a read-only source volume and GNU tar, without networking.
  const storage = execute(['run', '--rm', '--network', 'none', '--volumes-from', `supabase_storage_${sourceProject}:ro`,
    archiveImage, 'tar', '--xattrs', '--xattrs-include=*', '-C', '/mnt', '-cf', '-', '.']);
  const authConfig = inspect(`supabase_auth_${sourceProject}`);
  const storageConfig = inspect(`supabase_storage_${sourceProject}`);
  const restConfig = inspect(`supabase_rest_${sourceProject}`);
  // Authentication secrets and object bytes are included in the encrypted backup;
  // public evidence contains only hashes and durations. The drill key stays in RAM.
  const backup = Buffer.from(JSON.stringify({ dump: dump.toString('base64'), storage: storage.toString('base64'),
    authEnvironment: authConfig.Config.Env, storageEnvironment: storageConfig.Config.Env,
    restEnvironment: restConfig.Config.Env,
    password: fixture.password, capturedAt }));
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(backup), cipher.final()]);
  const tag = cipher.getAuthTag();
  writeFileSync(path.join(root, 'recovery-backup.enc'), Buffer.concat([iv, tag, encrypted]), { mode: 0o600 });
  let rejectedWrongKey = false;
  try { const wrong = createDecipheriv('aes-256-gcm', randomBytes(32), iv); wrong.setAuthTag(tag); wrong.update(encrypted); wrong.final(); }
  catch { rejectedWrongKey = true; }
  if (!rejectedWrongKey) throw Error('Wrong backup key was accepted');
  outageAt = Date.now();
  const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag);
  const recovered = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]));
  const recoveredDump = Buffer.from(recovered.dump, 'base64');
  const recoveredStorage = Buffer.from(recovered.storage, 'base64');
  if (digest(dump) !== digest(recoveredDump) || digest(storage) !== digest(recoveredStorage)) throw Error('Backup integrity mismatch');
  const dumpPath = path.join(root, 'database.private.dump');
  writeFileSync(dumpPath, recoveredDump, { mode: 0o600 });
  execute(['cp', dumpPath, `${sourceContainer}:/tmp/${database}.dump`]);
  const toc = execute(['exec', sourceContainer, 'pg_restore', '--list', `/tmp/${database}.dump`], { encoding: 'utf8' });
  const listPath = path.join(root, 'restore.list');
  writeFileSync(listPath, applicationRestoreList(toc).text);
  execute(['cp', listPath, `${sourceContainer}:/tmp/${database}.list`]);
  sql('postgres', `CREATE DATABASE ${database} TEMPLATE template0 OWNER supabase_admin;`);
  execute(['exec', '-e', 'PGPASSWORD=postgres', sourceContainer, 'pg_restore', '-h', '127.0.0.1', '-U', 'supabase_admin',
    '--exit-on-error', `--use-list=/tmp/${database}.list`, '-d', database, `/tmp/${database}.dump`]);
  sql(database, defaultOwnerAclSql(JSON.parse(originalCatalog), database), 'postgres');
  const restoredCatalog = sql(database, catalogQuery, 'postgres');
  writeFileSync(path.join(root, 'original-catalog.json'), originalCatalog);
  writeFileSync(path.join(root, 'restored-catalog.json'), restoredCatalog);
  try { execFileSync(process.execPath, ['scripts/backend/compare-catalog.mjs', path.join(root, 'original-catalog.json'),
    path.join(root, 'restored-catalog.json'), path.join(root, 'catalog-diff.json')], { stdio: 'pipe' }); }
  catch { throw Error('Restored schema, policies, grants or functions differ; independent catalog diff retained'); }
  const tables = JSON.parse(sql('postgres', "select jsonb_agg(tablename order by tablename) from pg_tables where schemaname='public';"));
  if (tables.some(name => !/^[a-z_][a-z0-9_]*$/.test(name))) throw Error('Unexpected relation identifier');
  const dataQuery = tables.map(name => `select '${name}'||':'||count(*)::text||':'||md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by md5(to_jsonb(r)::text)),'')) from public."${name}" r`).join(' UNION ALL ');
  const originalData = sql('postgres', dataQuery).split('\n').sort();
  const restoredData = sql(database, dataQuery).split('\n').sort();
  writeFileSync(path.join(root, 'public-table-digests.json'), JSON.stringify({ originalData, restoredData }, null, 2));
  if (JSON.stringify(originalData) !== JSON.stringify(restoredData)) throw Error('Restored public table data differs');
  async function startService(type, config, environment, port) {
    const name = `nello_wave03_${type}_${suffix}`;
    const env = Object.fromEntries(environment.map(line => { const index = line.indexOf('='); return [line.slice(0, index), line.slice(index + 1)]; }));
    for (const property of ['GOTRUE_DB_DATABASE_URL', 'DATABASE_URL', 'VECTOR_DATABASE_URL', 'PGRST_DB_URI']) if (env[property]) {
      const url = new URL(env[property]);
      if (![sourceContainer, 'db'].includes(url.hostname)) throw Error('Non-local provider database refused');
      url.hostname = sourceContainer; url.pathname = `/${database}`; env[property] = url.toString();
    }
    const envFile = path.join(root, `${type}.private.env`);
    writeFileSync(envFile, Object.entries(env).map(([name, value]) => `${name}=${value}`).join('\n'), { mode: 0o600 });
    const args = ['run', '--detach', '--name', name, '--network', network, '--env-file', envFile, '--publish', `127.0.0.1::${port}`];
    if (type === 'storage') {
      execute(['volume', 'create', '--label', 'nello.qa=wave03-recovery', storageVolume]);
      volumeCreated = true;
      args.push('--mount', `type=volume,source=${storageVolume},target=/mnt`);
    }
    args.push(config.Image);
    execute(args); services.push(name);
    if (type === 'storage') execute(['run', '--rm', '--network', 'none', '-i', '--mount', `type=volume,source=${storageVolume},target=/mnt`,
      archiveImage, 'tar', '--xattrs', '--xattrs-include=*', '-C', '/mnt', '-xf', '-'], { input: recoveredStorage });
    const binding = inspect(name).NetworkSettings.Ports[`${port}/tcp`][0];
    const origin = `http://127.0.0.1:${binding.HostPort}`;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { const response = await fetch(`${origin}${type === 'auth' ? '/health' : type === 'storage' ? '/status' : '/'}`, { signal: AbortSignal.timeout(1000) }); if (response.ok) return origin; }
      catch { /* Service initialization is bounded. */ }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    writeFileSync(path.join(root, `${type}.private.log`), execute(['logs', name]), { mode: 0o600 });
    throw Error(`Restored ${type} provider did not become ready`);
  }
  const auth = await startService('auth', authConfig, recovered.authEnvironment, 9999);
  const storageOrigin = await startService('storage', storageConfig, recovered.storageEnvironment, 5000);
  const rest = await startService('rest', restConfig, recovered.restEnvironment, 3000);
  const login = await fetch(`${auth}/token?grant_type=password`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixture.personas['patient-a'].email, password: recovered.password }), signal: AbortSignal.timeout(10000) });
  const session = await login.json();
  if (!login.ok || session.user?.id !== fixture.personas['patient-a'].id || !session.access_token) throw Error('Restored Auth login failed');
  const user = await fetch(`${auth}/user`, { headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(10000) });
  if (!user.ok || (await user.json()).id !== session.user.id) throw Error('Restored session validation failed');
  const patientId = fixture.personas['patient-a'].id;
  const otherPatientId = fixture.personas['patient-b'].id;
  if (![patientId, otherPatientId].every(id => /^[a-f0-9-]{36}$/.test(id))) throw Error('Invalid synthetic persona identifier');
  const restoredRead = await fetch(`${rest}/user_profiles?select=id&id=eq.${patientId}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(10000) });
  const ownRows = await restoredRead.json();
  if (!restoredRead.ok || ownRows.length !== 1 || ownRows[0].id !== patientId) throw Error('Restored API read failed');
  const forbiddenRead = await fetch(`${rest}/user_profiles?select=id&id=eq.${otherPatientId}`, {
    headers: { Authorization: `Bearer ${session.access_token}` }, signal: AbortSignal.timeout(10000) });
  if (!forbiddenRead.ok || (await forbiddenRead.json()).length !== 0) throw Error('Restored API allowed cross-tenant read');
  const probePath = '/foods?select=id&limit=0';
  const probeHeaders = { Authorization: `Bearer ${fixture.anonKey}` };
  const databaseProbe = await fetch(`${rest}${probePath}`, { headers: probeHeaders, signal: AbortSignal.timeout(3000) });
  const probeBody = await databaseProbe.json();
  if (databaseProbe.status !== 200 || !Array.isArray(probeBody) || probeBody.length) throw Error('Restored zero-row public catalog probe failed');
  const clinicalQuery = 'select coalesce(jsonb_agg(to_jsonb(r) order by r.id),\'[]\'::jsonb) from public.clinical_records r;';
  const clinicalMatched = digest(Buffer.from(sql('postgres', clinicalQuery))) === digest(Buffer.from(sql(database, clinicalQuery)));
  // Login updates auth timestamps; confirm immutable identity and password material separately.
  const identityQuery = "select jsonb_agg(jsonb_build_object('id',id,'email',email,'password',encrypted_password) order by id) from auth.users;";
  const authMatched = digest(Buffer.from(sql('postgres', identityQuery))) === digest(Buffer.from(sql(database, identityQuery)));
  const objects = JSON.parse(sql(database, "select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket_id,'name',name)), '[]'::jsonb) from storage.objects;"));
  const storageEnv = Object.fromEntries(recovered.storageEnvironment.map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
  for (const object of objects) {
    const route = `/object/authenticated/${encodeURIComponent(object.bucket)}/${object.name.split('/').map(encodeURIComponent).join('/')}`;
    const headers = { Authorization: `Bearer ${storageEnv.SERVICE_KEY}` };
    const original = await fetch(`${fixture.url}/storage/v1${route}`, { headers: { ...headers, apikey: fixture.anonKey }, signal: AbortSignal.timeout(10000) });
    const restored = await fetch(`${storageOrigin}${route}`, { headers, signal: AbortSignal.timeout(10000) });
    const originalBytes = Buffer.from(await original.arrayBuffer());
    const restoredBytes = Buffer.from(await restored.arrayBuffer());
    if (!original.ok || !restored.ok || digest(originalBytes) !== digest(restoredBytes)) {
      writeFileSync(path.join(root, 'storage-restoration.private.json'), JSON.stringify({ originalStatus: original.status,
        restoredStatus: restored.status, restoredBody: restoredBytes.toString('utf8') }), { mode: 0o600 });
      writeFileSync(path.join(root, 'storage.private.log'), execute(['logs', `nello_wave03_storage_${suffix}`]), { mode: 0o600 });
      throw Error(`Restored Storage object mismatch (${original.status}/${restored.status}; ${originalBytes.length}/${restoredBytes.length} bytes)`);
    }
  }
  if (!clinicalMatched || !authMatched || objects.length === 0) throw Error('Restored application data mismatch');
  const restoredAt = Date.now();
  // Exercise database loss only in the generated clone, after successful reads.
  // This proves the zero-row dependency query is not serving a cached false 200.
  sql('postgres', `ALTER DATABASE ${database} ALLOW_CONNECTIONS false; SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${database}';`);
  let databaseOutageDetected = false;
  try { const failed = await fetch(`${rest}${probePath}`, { headers: probeHeaders, signal: AbortSignal.timeout(3000) }); databaseOutageDetected = failed.status !== 200; }
  catch { databaseOutageDetected = true; }
  if (!databaseOutageDetected) throw Error('Database health metadata falsely reported ready during database outage');
  const result = { schemaVersion: 1, passed: true, scope: 'Isolated synthetic local stack; not a production PITR or backup certification',
    capturedAt: new Date(capturedAt).toISOString(), completedAt: new Date().toISOString(),
    rtoMs: restoredAt - outageAt, rpoMs: outageAt - capturedAt,
    clinicalMatched, catalogPoliciesGrantsFunctionsMatched: true, publicTablesCompared: tables.length,
    authIdentityAndPasswordsMatched: authMatched, authAccountsCompared, actualAuthLogin: true, actualSessionValidation: true,
    actualRestRead: true, restoredRlsIsolation: true, databaseOutageDetected,
    storageObjectsCompared: objects.length, encryptedBackupIntegrity: true, wrongKeyRejected: true,
    dumpSha256: digest(dump), storageArchiveSha256: digest(storage), productionData: false };
  writeFileSync(path.join(root, 'result.json'), JSON.stringify(result, null, 2));
  // Publish only this allowlisted summary, never the encrypted backup, provider
  // environment, object names, identities or private diagnostics above.
  mkdirSync('.backend-ci/recovery-results', { recursive: true });
  writeFileSync('.backend-ci/recovery-results/result.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  for (const service of services.reverse()) execute(['rm', '--force', service]);
  if (volumeCreated) execute(['volume', 'rm', storageVolume]);
  // Names are generated here, validated, and never accept user/provider input.
  if (!/^nello_wave03_recovery_[a-f0-9]{12}$/.test(database)) throw Error('Unsafe cleanup database');
  sql('postgres', `DROP DATABASE IF EXISTS ${database} WITH (FORCE);`);
  execute(['exec', sourceContainer, 'rm', '-f', `/tmp/${database}.dump`, `/tmp/${database}.list`]);
}
