import {assertIsolatedRuntime} from './isolated-runtime.mjs';
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
assertIsolatedRuntime();
const container='supabase_kong_nello-reconstruction';
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
 mkdirSync('.backend-ci/gateway-runtime',{recursive:true});
 // Contains disposable keys; ignored, private, never an artifact or output.
 const file='.backend-ci/gateway-runtime/kong.private.yml';
 writeFileSync(file,result,{mode:0o600});
 execFileSync('docker',['cp',file,`${container}:/home/kong/kong.yml`],{stdio:'pipe'});
 execFileSync('docker',['exec',container,'kong','reload'],{stdio:'pipe'});
 console.log('PASS: local Functions CORS override removed; worker policy preserved');
}
