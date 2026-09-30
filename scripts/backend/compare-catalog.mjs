import { readFileSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const expected = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const actual = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const differences = [];
for (const key of Object.keys(expected)) {
  if (!isDeepStrictEqual(expected[key], actual[key])) {
    const missing = expected[key].filter((item) => !actual[key]?.some((v) => isDeepStrictEqual(v, item)));
    const extra = (actual[key] || []).filter((item) => !expected[key].some((v) => isDeepStrictEqual(v, item)));
    differences.push({ section: key, missing, extra });
    console.error(`${key}: ${missing.length} missing/different, ${extra.length} extra/different`);
  }
}
if (process.argv[4]) writeFileSync(process.argv[4], JSON.stringify(differences, null, 2));
if (differences.length) process.exitCode = 1;
else console.log('Reconstructed catalog matches production metadata.');
