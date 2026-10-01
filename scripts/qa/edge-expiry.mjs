import {assertIsolatedRuntime} from './isolated-runtime.mjs';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import assert from 'node:assert/strict';
assertIsolatedRuntime();
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json','utf8'));
assert(['http://localhost:54321','http://127.0.0.1:54321'].includes(new URL(fixture.url).origin));
const secret=execFileSync('docker',['exec','supabase_auth_nello-reconstruction','printenv','GOTRUE_JWT_SECRET'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
if(secret.length<32)throw Error('Local signing key unavailable');
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const now=Math.floor(Date.now()/1000);
const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:fixture.personas['patient-a'].id,aud:'authenticated',role:'authenticated',exp:now-60,iat:now-120});
const token=unsigned+'.'+createHmac('sha256',secret).update(unsigned).digest('base64url');
const results=[];
for(const slug of ['generate-pdf','create-patient','openfoodfacts-proxy','confirm-document-asset','sentry-proxy']){
 const response=await fetch(`${fixture.url}/functions/v1/${slug}`,{method:'POST',headers:{authorization:`Bearer ${token}`,apikey:fixture.anonKey,'content-type':'application/json',origin:'https://nellonutri.com.br'},body:'{}',signal:AbortSignal.timeout(90000)});
 await response.arrayBuffer();assert.equal(response.status,401,slug+' must deny correctly signed expired token');
 results.push({slug,status:response.status,passed:true});
}
writeFileSync('.backend-ci/edge-boundary-results/expired.json',JSON.stringify({passed:true,productionData:false,results},null,2));
console.log('PASS: five sensitive Edge Functions reject correctly signed expired local JWTs');
