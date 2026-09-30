import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { canonicalConstraint } from './constraint-representation.mjs';
const expected = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const actual = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const differences = [];
// Catalog aggregation order and physical column order are not contracts here.
// Keep multiplicity, every field, ordered function config and enum sort positions.
function canonical(key, items) {
  return items?.map((item) => {
    const result = { ...(key === 'constraints' ? canonicalConstraint(item) : item) };
    if (key === 'realtime' && Array.isArray(result.columns)) result.columns = [...result.columns].sort();
    // ACL entry order is incidental; principal, rights, grant options and grantor remain exact.
    if (typeof result.grants === 'string' && /^\{[^"{}]*\}$/.test(result.grants)) {
      result.grants = '{' + result.grants.slice(1, -1).split(',').sort().join(',') + '}';
    }
    return result;
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
  const left = canonical(key, expected[key]), right = canonical(key, actual[key]);
  if (!isDeepStrictEqual(left, right)) {
    const missing = (left || []).filter((item) => !right?.some((v) => isDeepStrictEqual(v, item)));
    const extra = (right || []).filter((item) => !left?.some((v) => isDeepStrictEqual(v, item)));
    differences.push({ section: key, missing, extra });
    console.error(`${key}: ${missing.length} missing/different, ${extra.length} extra/different`);
  }
}
if (process.argv[4]) writeFileSync(process.argv[4], JSON.stringify(differences, null, 2));
if (differences.length) process.exitCode = 1;
else console.log('Reconstructed catalog matches production metadata.');
