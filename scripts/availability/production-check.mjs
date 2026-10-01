import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {smokeAvailability} from './smoke.mjs';

export async function checkProduction({smoke=smokeAvailability,fetcher=fetch,env=process.env}={}) {
  const origin='https://nellonutri.com.br';
  let result;
  try { await smoke(origin); result={passed:true,environment:'production',checkedAt:new Date().toISOString()}; }
  catch { result={passed:false,environment:'production',checkedAt:new Date().toISOString(),reason:'availability_contract_failed'}; }
  if(!result.passed && env.SENTRY_DSN) {
    const dsn=new URL(env.SENTRY_DSN),project=dsn.pathname.split('/').at(-1),id=randomUUID().replaceAll('-','');
    const endpoint=new URL(`/api/${project}/envelope/`,dsn);endpoint.username='';endpoint.password='';
    endpoint.searchParams.set('sentry_key',dsn.username);endpoint.searchParams.set('sentry_version','7');
    const event={event_id:id,timestamp:Date.now()/1000,platform:'javascript',environment:'production',level:'error',fingerprint:['production-availability-contract'],message:'Production availability contract failed',tags:{source:'external-contract-monitor'}};
    try { const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/x-sentry-envelope'},body:JSON.stringify({event_id:id})+'\n'+JSON.stringify({type:'event'})+'\n'+JSON.stringify(event),signal:AbortSignal.timeout(10000)});result.alertDelivered=response.ok; }
    catch { result.alertDelivered=false; }
  }
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await checkProduction();writeFileSync('production-check.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
  // Availability incidents are grouped in Sentry. Scheduled checks do not send
  // a GitHub failure email on every probe; their actual result is in the artifact.
}
