import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { summarizeNpmLog } from './install-diagnostics.mjs';

const started = Date.now();
console.log(`Release install: node ${process.version}, ${process.platform}/${process.arch}`);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// All locked packages use the public npm registry. Use that same upstream in CI
// and Vercel instead of the provider's injected loopback registry proxy.
const registry = '--registry=https://registry.npmjs.org';
const { packageManager } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
if (!/^npm@\d+\.\d+\.\d+$/.test(packageManager)) throw new Error('Exact npm release required');
for (const args of [['install', '--global', packageManager, registry], ['ci', registry]]) {
  const result = spawnSync(npm, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) {
    const logDirectory = path.join(process.env.npm_config_cache || path.join(homedir(), '.npm'), '_logs');
    try {
      const logs = readdirSync(logDirectory).filter(name => /^\d{4}-.*-debug-\d+\.log$/.test(name))
        .map(name => ({ file: path.join(logDirectory, name), time: statSync(path.join(logDirectory, name)).mtimeMs }))
        .filter(log => log.time >= started).sort((a, b) => b.time - a.time).slice(0, 2);
      for (const log of logs) console.error('Structured npm diagnostic:', JSON.stringify(summarizeNpmLog(readFileSync(log.file, 'utf8'))));
    } catch { console.error('Structured npm diagnostic unavailable.'); }
    // Diagnostics must never convert a failed install into a successful deployment.
    process.exit(result.status || 1);
  }
}
