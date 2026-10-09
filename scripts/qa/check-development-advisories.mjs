import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { checkDevelopmentAdvisories } from './development-advisory-policy.mjs';

if (!process.env.npm_execpath) throw new Error('Run through npm run check:security:development');
let report;
try {
  report = execFileSync(process.execPath, [process.env.npm_execpath, 'audit', '--json', '--fetch-timeout=20000', '--fetch-retries=1'], {
    encoding: 'utf8', timeout: 90000, maxBuffer: 16 * 1024 * 1024,
  });
} catch (error) {
  // npm exits 1 for advisory findings. Transport errors and incomplete JSON remain failures.
  if (error.status !== 1 || !error.stdout) throw new Error('Complete dependency audit unavailable');
  report = error.stdout;
}
const audit = JSON.parse(report);
mkdirSync('.qa-security', { recursive: true });
writeFileSync('.qa-security/development-audit.json', JSON.stringify({ checkedAt: new Date().toISOString(), audit }, null, 2));
const result = checkDevelopmentAdvisories(audit,
  JSON.parse(readFileSync('package-lock.json', 'utf8')),
  JSON.parse(readFileSync('operations/development-advisory-policy.json', 'utf8')));
writeFileSync('.qa-security/development-review.json', JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
console.log(JSON.stringify({ ...result, notice: 'Reviewed dev-only advisory remains unpatched; this is not audit zero.' }));
