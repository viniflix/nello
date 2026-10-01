import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Restore planners must fetch current erasure tombstones separately from the
 * old backup. A backup's own tombstones cannot authorize resurrecting bytes. */
export function planStorageRecovery(objects, currentErasureExport, projectRef, now = Date.now()) {
  const captured = Date.parse(currentErasureExport?.capturedAt);
  if (!/^[a-z]{20}$/.test(projectRef) || currentErasureExport?.sourceProjectRef !== projectRef
    || currentErasureExport?.complete !== true || !Number.isFinite(captured)
    || captured > now || now - captured > 15 * 60 * 1000
    || !Array.isArray(currentErasureExport.exclusions) || !Array.isArray(objects)) {
    throw Error('Fresh independent authoritative Storage erasure export required');
  }
  const key = object => {
    if (!object || !/^[a-zA-Z0-9_-]+$/.test(object.bucket_id || '')
      || typeof object.object_path !== 'string' || !object.object_path.length
      || object.object_path.startsWith('/') || /[\\\x00-\x1f]/.test(object.object_path)
      || object.object_path.split('/').some(part => !part || part === '.' || part === '..')) {
      throw Error('Invalid Storage restore object identity');
    }
    return object.bucket_id + '/' + object.object_path;
  };
  const blocked = new Set(currentErasureExport.exclusions.map(key));
  const allowed = [], excluded = [];
  const seen = new Set();
  for (const object of objects) {
    const identity = key(object);
    if (seen.has(identity)) throw Error('Duplicate Storage restore object identity');
    seen.add(identity);
    (blocked.has(identity) ? excluded : allowed).push(object);
  }
  return { sourceProjectRef: projectRef, erasureExportCapturedAt: currentErasureExport.capturedAt,
    generatedAt: new Date(now).toISOString(), allowed, excluded, executed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [inventory, erasures, projectRef, output] = process.argv.slice(2);
  if (!inventory || !erasures || !output) throw Error('Usage: storage-recovery.mjs inventory.json current-erasures.json project-ref private-plan.json');
  const plan = planStorageRecovery(JSON.parse(readFileSync(inventory, 'utf8')), JSON.parse(readFileSync(erasures, 'utf8')), projectRef);
  writeFileSync(output, JSON.stringify(plan, null, 2), { mode: 0o600, flag: 'wx' });
  console.log(`Storage recovery plan: ${plan.allowed.length} eligible, ${plan.excluded.length} erased objects excluded. No restore executed.`);
}
