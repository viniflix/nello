// @vitest-environment node
import {beforeEach,describe,it,expect,vi} from 'vitest';
let readContinuity;
beforeEach(async()=>{vi.resetModules();({readContinuity}=await import('../../supabase/functions/sentry-proxy/monitor.js'));});
const now=Date.parse('2026-10-07T12:00:00Z');
const metadata={id:'10435462',enabled:true,config:{environment:'production'},dataSources:[{type:'uptime_subscription',queryObj:{url:'https://nellonutri.com.br/api/health',method:'GET',intervalSeconds:60,headers:[],body:null,traceSampling:false,responseCaptureEnabled:false}}]};
function provider(rows){return vi.fn(async url=>String(url).includes('/detectors/')?Response.json(metadata):Response.json(rows));}
describe('admin independent monitor aggregates',()=>{
 it('distinguishes unconfigured, denied, warming coverage and never returns raw provider data',async()=>{
  expect((await readContinuity({now})).state).toBe('not_configured');
  const denied=await readContinuity({token:'PRIVATE_TOKEN',now,fetcher:vi.fn(async()=>new Response('PRIVATE_CONTENT',{status:403}))});
  expect(denied.state).toBe('unavailable');expect(denied.assessment).toBeNull();expect(JSON.stringify(denied)).not.toMatch(/PRIVATE/);
  const rows=Array.from({length:6},(_,i)=>({scheduledCheckTime:new Date(now-(5-i)*60000).toISOString(),checkStatus:'success',httpStatusCode:200,traceId:'PRIVATE_TRACE'}));
  const v=await readContinuity({token:'PRIVATE_TOKEN',now,fetcher:provider(rows)});
  expect(v.assessment.state).toBe('warming_up');expect(v.assessment.windows[5].covered).toBe(true);expect(v.assessment.windows[360].covered).toBe(false);
  expect(JSON.stringify(v)).not.toMatch(/PRIVATE|traceId|samples":\[/);
 });
 it('coalesces and caches only aggregates, bounds refresh, and isolates changed credentials',async()=>{
  const fetcher=provider([]);
  await Promise.all([readContinuity({token:'a',now,fetcher}),readContinuity({token:'a',now,fetcher})]);expect(fetcher).toHaveBeenCalledTimes(2);
  await readContinuity({token:'a',now:now+119999,fetcher});expect(fetcher).toHaveBeenCalledTimes(2);
  await readContinuity({token:'a',now:now+120000,fetcher});expect(fetcher).toHaveBeenCalledTimes(4);
  await readContinuity({token:'b',now:now+120000,fetcher});expect(fetcher).toHaveBeenCalledTimes(6);
 });
 it('rejects a changed monitor and future checks instead of inventing coverage',async()=>{
  const bad=structuredClone(metadata);bad.config.environment='test';
  expect((await readContinuity({token:'a',now,fetcher:vi.fn(async()=>Response.json(bad))})).state).toBe('unavailable');
  expect((await readContinuity({token:'a',now,fetcher:provider([{scheduledCheckTime:new Date(now+60000).toISOString(),checkStatus:'success',httpStatusCode:200}])})).state).toBe('unavailable');
 });
});
