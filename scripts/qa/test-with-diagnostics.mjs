import { spawn } from 'node:child_process';
import { relevantDiagnostic } from './diagnostic-policy.mjs';
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], { stdio: ['inherit', 'pipe', 'pipe'] });
let output = '';
for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) stream.on('data', chunk => { output += chunk; target.write(chunk); });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('close', code => {
  const diagnostics = output.replace(/\u001b\[[0-9;]*m/g, '').split('\n').filter(relevantDiagnostic);
  if (diagnostics.length) console.error('Actionable React/CSS diagnostics must be repaired:', diagnostics);
  process.exitCode = code || (diagnostics.length ? 1 : 0);
});
