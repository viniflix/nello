import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({fetch:vi.fn(),quota:vi.fn()}));
vi.mock('../../supabase/functions/_shared/quota.ts',()=>({consumeQuota:mocks.quota}));
vi.mock('../../supabase/functions/_shared/http.ts',()=>({timedFetch:mocks.fetch,edgeBoundary:(fn:unknown)=>fn}));
let handler:(req:Request)=>Promise<Response>;
const response=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers});
const request=(body:unknown)=>new Request('https://local.example/functions/v1/sentry-proxy',{method:'POST',headers:{authorization:'Bearer synthetic', 'content-type':'application/json'},body:JSON.stringify(body)});
beforeEach(async()=>{
 vi.resetModules();mocks.fetch.mockReset();mocks.quota.mockReset();
 const env:Record<string,string>={SUPABASE_URL:'https://database.example',SUPABASE_ANON_KEY:'synthetic-anon',SENTRY_API_TOKEN:'synthetic-server-token'};
 vi.stubGlobal('Deno',{env:{get:(key:string)=>env[key]},serve:(fn:typeof handler)=>{handler=fn;}});
 await import('../../supabase/functions/sentry-proxy/index.ts');
});
afterEach(()=>vi.unstubAllGlobals());
function authorize(){mocks.fetch.mockResolvedValueOnce(response({id:'synthetic-operator'})).mockResolvedValueOnce(response({authorized:true}));}
describe('administrative Sentry handler',()=>{
 it('denies source reads before any provider call without server authority',async()=>{
  mocks.fetch.mockResolvedValueOnce(response({id:'synthetic-user'})).mockResolvedValueOnce(response({authorized:false}));
  expect((await handler(request({action:'sources'}))).status).toBe(403);expect(mocks.fetch).toHaveBeenCalledTimes(2);expect(mocks.quota).not.toHaveBeenCalled();
 });
 it('applies real window, environment, release and opaque cursor with no arbitrary client endpoint',async()=>{
  authorize();mocks.fetch.mockResolvedValueOnce(response([{id:'1',shortId:'NELLO-1',type:'error',metadata:{type:'TypeError'},count:'1'}],200,{link:'rel="next"; results="true"; cursor="1:2:0"'}));
  const result=await handler(request({action:'issues_page',hours:72,environment:'production',release:'abcdef1234',cursor:'0:1:0'}));
  expect(result.status).toBe(200);const body=await result.json();expect(body.next_cursor).toBe('1:2:0');expect(body.count_semantics).toBe('lifetime');
  const url=mocks.fetch.mock.calls[2][0];expect(url.searchParams.get('statsPeriod')).toBe('72h');expect(url.searchParams.get('environment')).toBe('production');expect(url.searchParams.get('query')).toBe('is:unresolved release:abcdef1234');expect(url.searchParams.get('cursor')).toBe('0:1:0');
 });
 it('validates project ownership before returning an event',async()=>{
  authorize();mocks.fetch.mockResolvedValueOnce(response({id:'1'})).mockResolvedValueOnce(response({project:{id:'2'}}));
  expect((await handler(request({action:'latest_event',issue_id:'1'}))).status).toBe(404);expect(mocks.fetch).toHaveBeenCalledTimes(4);
 });
 it('reports missing providers and authorization errors without exposing token or response content',async()=>{
  authorize();mocks.fetch.mockResolvedValueOnce(response({private:'PRIVATE_SENTINEL'},403));
  const result=await handler(request({action:'sources'}));const body=await result.json();
  expect(body.sources.find((s:any)=>s.provider==='Sentry').state).toBe('authorization_required');
  expect(body.sources.find((s:any)=>s.provider==='PostHog').state).toBe('not_configured');
  expect(body.sources.find((s:any)=>s.provider==='Resend').state).toBe('not_configured');
  expect(JSON.stringify(body)).not.toContain('PRIVATE_SENTINEL');expect(JSON.stringify(body)).not.toContain('synthetic-server-token');expect(body.sources.every((s:any)=>s.usage===null)).toBe(true);
 });
 it('rejects malformed fixed filters before provider access',async()=>{
  authorize();expect((await handler(request({action:'issues_page',cursor:'https://evil.example'}))).status).toBe(400);expect(mocks.fetch).toHaveBeenCalledTimes(2);
 });
});
