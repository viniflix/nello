import { writeFileSync, readFileSync } from 'node:fs';
import { verifyHostedAuth } from './auth-contract.mjs';

const contract = JSON.parse(readFileSync('operations/backend/auth-contract.json', 'utf8'));
if (!process.env.SUPABASE_ACCESS_TOKEN || !process.argv[2]) throw Error('Management token and private evidence output path required');
const response = await fetch(`https://api.supabase.com/v1/projects/${contract.projectRef}/config/auth`, {
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(20000),
});
if (!response.ok) throw Error(`Auth Management API HTTP ${response.status}`);
const actual = await response.json();
// Only whitelisted, non-secret fields may leave process memory.
const safe = { capturedAt: new Date().toISOString(), project: contract.projectRef };
for (const key of Object.keys(contract.hosted)) safe[key] = actual[key];
writeFileSync(process.argv[2], JSON.stringify(safe, null, 2));
verifyHostedAuth(safe, contract);
console.log('Hosted Auth matches the recorded contract; sanitized evidence saved.');
