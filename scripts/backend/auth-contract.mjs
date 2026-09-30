import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function verifyHostedAuth(actual, contract) {
  const mismatches = Object.entries(contract.hosted).filter(([key, value]) => actual[key] !== value).map(([key]) => key);
  if (mismatches.length) throw Error(`Hosted Auth baseline drift: ${mismatches.join(', ')}`);
}

export function verifyIsolatedAuth(config, contract) {
  const values = {};
  let section = '';
  for (const line of config.split(/\r?\n/)) {
    const heading = line.match(/^\[([^\]]+)\]\s*$/);
    if (heading) { section = heading[1]; continue; }
    const entry = line.match(/^([a-z_]+)\s*=\s*(true|false|\d+|"[^"\n]*")\s*(?:#.*)?$/);
    if (entry) {
      const key = `${section}.${entry[1]}`;
      if (Object.hasOwn(values, key)) throw Error(`Duplicate config key: ${key}`);
      values[key] = JSON.parse(entry[2]);
    }
  }
  const mismatches = Object.entries(contract.isolatedConfig).filter(([key, value]) => values[key] !== value).map(([key]) => key);
  if (mismatches.length) throw Error(`Isolated Auth baseline drift: ${mismatches.join(', ')}`);
  for (const fn of JSON.parse(readFileSync('operations/backend/baseline.json', 'utf8')).functions) {
    if (values[`functions.${fn.slug}.verify_jwt`] !== true) throw Error(`JWT verification missing: ${fn.slug}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const contract = JSON.parse(readFileSync('operations/backend/auth-contract.json', 'utf8'));
  verifyIsolatedAuth(readFileSync('supabase/config.toml', 'utf8'), contract);
  if (process.argv[2]) {
    const snapshot = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''));
    if (snapshot.project !== contract.projectRef) throw Error('Auth snapshot belongs to a different project');
    verifyHostedAuth(snapshot, contract);
  }
  console.log('Auth baseline contract verified; no hosted configuration was changed.');
}
