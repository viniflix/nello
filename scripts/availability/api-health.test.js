// @vitest-environment node
import {createServer} from 'node:http';
import {afterEach,it,expect,vi} from 'vitest';
import handler from '../../api/health.js';
const servers=[];
async function serve(listener){
 const server=createServer(listener);servers.push(server);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return `http://127.0.0.1:${server.address().port}`;
}
afterEach(async()=>{
 vi.restoreAllMocks();vi.unstubAllEnvs();
 for(const server of servers.splice(0)){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
it('keeps the public 503/HEAD/no-cache contract for persistent failure, with safe server-only reasons',async()=>{
 const log=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const upstream=await serve((req,res)=>{
  res.setHeader('content-type','application/json');
  if(req.url==='/storage/v1/health'){res.statusCode=502;res.end('{"secret":"PRIVATE_PROVIDER_BODY"}');}
  else res.end(req.url.startsWith('/auth/')?' {"external":{"email":true}}':'[]');
 });
 vi.stubEnv('SUPABASE_URL',upstream);vi.stubEnv('SUPABASE_ANON_KEY','synthetic');vi.stubEnv('NELLO_LOCAL_QA','isolated');
 const publicApi=await serve((req,res)=>{res.status=code=>{res.statusCode=code;return res;};void handler(req,res);});
 const response=await fetch(publicApi);expect(response.status).toBe(503);
 expect(response.headers.get('cache-control')).toBe('no-store');
 const body=await response.json();expect(body).toMatchObject({status:'degraded',checks:{auth:'operational',database:'operational',storage:'unavailable'}});
 expect(Object.keys(body).sort()).toEqual(['checkedAt','checks','incidents','schemaVersion','status']);
 expect(log).toHaveBeenCalledWith('dependency_health_check',expect.objectContaining({dependency:'storage',attempts:2,failures:['http_502','http_502'],recovered:false}));
 expect(JSON.stringify([body,log.mock.calls])).not.toMatch(/PRIVATE_PROVIDER_BODY|synthetic|127\.0\.0\.1/);
 const head=await fetch(publicApi,{method:'HEAD'});expect(head.status).toBe(503);expect(await head.text()).toBe('');
 const post=await fetch(publicApi,{method:'POST'});expect(post.status).toBe(405);expect(post.headers.get('allow')).toBe('GET, HEAD');
});
