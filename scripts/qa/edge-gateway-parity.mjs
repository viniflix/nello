import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from './isolated-runtime.mjs';
import {execFileSync} from 'node:child_process';
assertIsolatedRuntime();
const container='supabase_kong_nello-reconstruction';
const status=JSON.parse(execFileSync(supabaseCommand,supabaseArgs(['status','--workdir','.backend-ci','--output','json']),{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(!['http://localhost:54321','http://127.0.0.1:54321'].includes(new URL(status.API_URL).origin))throw Error('Unexpected isolated gateway');
// The CLI adds a wildcard CORS plugin to Functions. Hosted Functions preserve
// the worker's allowlist (verified on the existing production asset handler).
// Remove ONLY that local response override, never gateway auth or other routes.
const original=execFileSync('docker',['exec',container,'cat','/home/kong/kong.yml'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const start=original.indexOf('  - name: functions-v1\n');
if(start<0)throw Error('Unexpected local Functions gateway');
let end=original.indexOf('\n  - name:',start+1);if(end<0)end=original.length;
const section=original.slice(start,end);
const adjusted=section.replace('      - name: cors\n','');
if(adjusted===section && !section.includes('      - name: cors')) {
 console.log('PASS: local Functions gateway already preserves worker CORS');
} else {
 if(!section.includes('      - name: request-transformer'))throw Error('Unexpected gateway schema');
 const result=original.slice(0,start)+adjusted+original.slice(end);
 // Apply the DB-less configuration through the live Admin API. CLI restart
 // regenerates its original YAML; nginx reload can retain old worker state.
 // Keep the disposable credentials in memory/private stdin, never output.
 const payload=new URLSearchParams({config:result}).toString();
 execFileSync('docker',['exec','-i',container,'sh','-c','cat > /tmp/nello-functions-config.private'],{input:payload,stdio:['pipe','pipe','pipe']});
 try {
  execFileSync('docker',['exec',container,'wget','-qO-','--header=Content-Type: application/x-www-form-urlencoded','--post-file=/tmp/nello-functions-config.private','http://127.0.0.1:8001/config'],{stdio:['ignore','pipe','pipe'],maxBuffer:4*1024*1024});
 } finally {
  execFileSync('docker',['exec',container,'rm','-f','/tmp/nello-functions-config.private'],{stdio:'pipe'});
 }
}
let verified=false;
for(let attempt=0;attempt<30&&!verified;attempt++){
 try {
  const headers={authorization:`Bearer ${status.ANON_KEY}`,apikey:status.ANON_KEY};
  const allowed=await fetch(status.API_URL+'/functions/v1/create-patient',{headers:{...headers,origin:'https://nellonutri.com.br'},signal:AbortSignal.timeout(3000)});
  await allowed.arrayBuffer();
  const rejected=await fetch(status.API_URL+'/functions/v1/create-patient',{headers:{...headers,origin:'https://untrusted.example'},signal:AbortSignal.timeout(3000)});
  await rejected.arrayBuffer();
  verified=allowed.status===405&&allowed.headers.get('access-control-allow-origin')==='https://nellonutri.com.br'
   &&rejected.status===403&&!rejected.headers.has('access-control-allow-origin');
 } catch { /* Gateway reconnecting after the isolated restart. */ }
 if(!verified)await new Promise(resolve=>setTimeout(resolve,500));
}
if(!verified)throw Error('Local gateway did not preserve real worker CORS responses');
console.log('PASS: live isolated HTTP proves worker allowlist and rejected origin; no wildcard override');
