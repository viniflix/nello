import {describe,it,expect,vi,beforeEach} from 'vitest';
let api;
const now=Date.parse('2026-10-07T10:00:00Z');
const columns=['event','outcome','captures','observed_people','last_observed_at'];
const payload=()=>({columns,results:[['meal_plan_published','capture',4,2,'2026-10-07T09:00:00Z']]});
const args=(fetcher)=>({days:30,host:'https://us.posthog.com',project:'341310',token:'synthetic-private-token',fetcher,now:()=>now});
beforeEach(async()=>{vi.resetModules();api=await import('../../supabase/functions/sentry-proxy/productAnalytics.js');});
describe('governed product capture query',()=>{
 it('rejects arbitrary queries, destinations, windows and incorrect provider contracts',()=>{
  for(const b of [{window_days:31},{window_days:'30'},{query:'select secrets'},{window_days:30,url:'https://evil.example'}])expect(()=>api.analyticsWindow(b)).toThrow();
  expect(api.productQuery(30)).toContain("properties.audience IN ('external','public')");expect(api.productQuery(30)).toContain('count(DISTINCT uuid)');
  for(const value of [{...payload(),columns:['unexpected']},{...payload(),results:[...payload().results,...payload().results]},{...payload(),results:[['meal_plan_published','capture',1,2,'2026-10-07T09:00:00Z']]},{...payload(),results:[['meal_plan_published','capture',1,1,'2026-10-08T09:00:00Z']]}])expect(()=>api.safeProductResults(value,now,30)).toThrow();
 });
 it('does not call a provider without server configuration or an allowed host',async()=>{
  const fetcher=vi.fn();expect((await api.readProductAnalytics({...args(fetcher),token:''})).state).toBe('not_configured');expect((await api.readProductAnalytics({...args(fetcher),host:'https://evil.example'})).state).toBe('not_configured');expect(fetcher).not.toHaveBeenCalled();
 });
 it('coalesces refreshes, limits cache freshness and preserves original timestamps',async()=>{
  let resolve;const fetcher=vi.fn(()=>new Promise(r=>resolve=r));
  const a=api.readProductAnalytics(args(fetcher));const b=api.readProductAnalytics(args(fetcher));
  expect(fetcher).toHaveBeenCalledTimes(1);resolve(new Response(JSON.stringify(payload())));
  const [one,two]=await Promise.all([a,b]);expect(two).toEqual(one);
  const cached=await api.readProductAnalytics({...args(fetcher),now:()=>now+60000});expect(cached.generated_at).toBe(one.generated_at);expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockResolvedValueOnce(new Response('PRIVATE_PROVIDER_SENTINEL',{status:503}));
  await expect(api.readProductAnalytics({...args(fetcher),now:()=>now+120001})).rejects.toThrow('analytics_provider_unavailable');
 });
 it('cancels an incomplete provider query and bounds concurrent different windows',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({query_status:{complete:false,id:'synthetic-query'}}))).mockResolvedValueOnce(new Response('{}'));
  await expect(api.readProductAnalytics(args(fetcher))).rejects.toThrow('analytics_query_incomplete');expect(fetcher.mock.calls[1][0]).toBe('https://us.posthog.com/api/projects/341310/query/synthetic-query/');expect(fetcher.mock.calls[1][1].method).toBe('DELETE');
  const pending=[];const delayed=vi.fn(()=>new Promise(r=>pending.push(r)));
  const jobs=[30,90].map(days=>api.readProductAnalytics({...args(delayed),days}));
  await expect(api.readProductAnalytics({...args(delayed),days:180})).rejects.toThrow('analytics_busy');
  pending.forEach(resolve=>resolve(new Response(JSON.stringify(payload()))));await Promise.all(jobs);
 });
});
