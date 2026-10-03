// @vitest-environment node
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {smokeAvailability} from './smoke.mjs';

function runtime(overrides={}) {
 const response=(body,type,status=200)=>new Response(body,{status,headers:{'content-type':type}});
 return async input=>{
  const path=new URL(input).pathname;
  if(overrides[path])return overrides[path]();
  if(path==='/api/health')return response(JSON.stringify({schemaVersion:1,status:'operational',checkedAt:new Date().toISOString(),checks:{auth:'operational',database:'operational',storage:'operational'},incidents:[]}),'application/json');
  if(path==='/robots.txt')return response(readFileSync('public/robots.txt','utf8'),'text/plain');
  if(path==='/sitemap.xml')return response(readFileSync('public/sitemap.xml','utf8'),'application/xml');
  if(path==='/main.js')return response('export {};','application/javascript');
  if(path==='/main.css')return response('body {}','text/css');
  if(path==='/login'||path==='/status')return response('<title>Nello</title><div id="root"></div><script src="/main.js"></script><link href="/main.css">','text/html');
  return response('Missing','text/plain',404);
 };
}
it('accepts the public sitemap and status while requiring real 404s and private crawler exclusions',async()=>{
 const result=await smokeAvailability('https://nellonutri.com.br',{fetcher:runtime(),requireHeaders:false});
 expect(result.passed).toBe(true);expect(result.health.ok).toBe(true);
 expect(result.checks).toContainEqual({path:'/sitemap.xml',status:200});
});
it('rejects a sitemap containing a clinical patient route',async()=>{
 const fetcher=runtime({'/sitemap.xml':()=>new Response(readFileSync('public/sitemap.xml','utf8').replace('/ajuda','/patient/private'),{headers:{'content-type':'application/xml'}})});
 await expect(smokeAvailability('https://nellonutri.com.br',{fetcher,requireHeaders:false})).rejects.toThrow('Public sitemap policy failed');
});
it('rejects a robots policy that exposes a clinical area',async()=>{
 const fetcher=runtime({'/robots.txt':()=>new Response(readFileSync('public/robots.txt','utf8').replace('Disallow: /nutritionist','Allow: /nutritionist'),{headers:{'content-type':'text/plain'}})});
 await expect(smokeAvailability('https://nellonutri.com.br',{fetcher,requireHeaders:false})).rejects.toThrow('Private application robots policy failed');
});
