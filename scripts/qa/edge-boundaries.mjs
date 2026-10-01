import {assertIsolatedRuntime} from './isolated-runtime.mjs';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import assert from 'node:assert/strict';
assertIsolatedRuntime();
await import('./edge-gateway-parity.mjs');
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json','utf8'));
if(!['http://127.0.0.1:54321','http://localhost:54321'].includes(new URL(fixture.url).origin))throw Error('Only disposable loopback accepted');
const results=[];
const tokenFor=async key=>{
 const client=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.signInWithPassword({email:fixture.personas[key].email,password:fixture.password});
 assert(!error,'Synthetic login');return data.session.access_token;
};
const patient=await tokenFor('patient-a'),professional=await tokenFor('nutritionist-a');
async function test(name,slug,expected,{token=patient,origin='https://nellonutri.com.br',method='POST',body={}}={}) {
 const response=await fetch(`${fixture.url}/functions/v1/${slug}`,{method,
 headers:{authorization:`Bearer ${token}`,apikey:fixture.anonKey,origin,'content-type':'application/json',...(method==='OPTIONS'?{'access-control-request-method':'POST','access-control-request-headers':'authorization,apikey,content-type,x-client-info'}:{})},
 ...(method==='POST'?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});
 const raw=await response.text();
 assert.equal(response.status,expected,name);
 if(origin==='https://nellonutri.com.br')assert.equal(response.headers.get('access-control-allow-origin'),origin,name+' CORS');
 else assert.equal(response.headers.get('access-control-allow-origin'),null,name+' rejected CORS');
 if(expected===200&&slug==='generate-pdf')assert((body.format==='binary'?raw:atob(JSON.parse(raw).base64Pdf)).startsWith('%PDF-'),'Real PDF signature');
 results.push({name,status:response.status,passed:true});
 console.log(`PASS: ${name}`);
}
for(const slug of ['create-patient','generate-pdf','openfoodfacts-proxy','confirm-document-asset','sentry-proxy','delete-user-securely','sentry-test','sentry-issues']){
 await test('rejected origin '+slug,slug,403,{origin:'https://untrusted.example'});
 await test('preflight '+slug,slug,204,{method:'OPTIONS'});
}
await test('PDF anonymous key is not a user','generate-pdf',401,{token:fixture.anonKey});
await test('Document wrong role','confirm-document-asset',403,{body:{uploadId:'11111111-1111-4111-8111-111111111111'}});
await test('Document foreign reservation','confirm-document-asset',404,{token:professional,body:{uploadId:'11111111-1111-4111-8111-111111111111'}});
await test('Sentry requires privileged MFA','sentry-proxy',403);
await test('PDF rejects invalid schema','generate-pdf',400,{body:{lines:[{}]}});
for(let i=0;i<9;i++)await test('PDF bounded real generation '+(i+1),'generate-pdf',200,{body:{title:'QA technical document',fileName:'qa.pdf',lines:['Synthetic data only'],...(i%2?{format:'binary'}:{})}});
await test('PDF persistent user quota','generate-pdf',429,{body:{lines:[]}});
const second=await tokenFor('patient-b');
const concurrent=await Promise.all(Array.from({length:11},async()=>{
 const response=await fetch(`${fixture.url}/functions/v1/generate-pdf`,{method:'POST',headers:{authorization:`Bearer ${second}`,apikey:fixture.anonKey,origin:'https://nellonutri.com.br','content-type':'application/json'},body:JSON.stringify({lines:['Synthetic concurrency'],format:'binary'}),signal:AbortSignal.timeout(90000)});
 await response.arrayBuffer();return response.status;
}));
assert.equal(concurrent.filter(status=>status===200).length,10,'Atomic distributed user quota');
assert.equal(concurrent.filter(status=>status===429).length,1,'Exactly one concurrent overflow');
results.push({name:'11 concurrent PDF requests: exactly 10 allowed',passed:true,statuses:concurrent});
console.log('PASS: concurrent persisted PDF quota across real Edge requests');
mkdirSync('.backend-ci/edge-boundary-results',{recursive:true});
writeFileSync('.backend-ci/edge-boundary-results/result.json',JSON.stringify({passed:true,productionData:false,results,capturedAt:new Date().toISOString()},null,2));
