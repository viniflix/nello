import {it,expect}from'vitest';import{smokeDeployment}from'./smoke.mjs';
function fixture(mutation){return async url=>{const path=new URL(url).pathname;const types={'/login':'text/html','/assets/main.js':'application/javascript','/assets/main.css':'text/css'};const body=path==='/login'?'<title>Nello</title><div id="root"></div><script src="/assets/main.js"></script><link href="/assets/main.css">':'/* healthy synthetic asset */';const headers={'content-type':types[path]||'text/html',...Object.fromEntries(['content-security-policy','x-content-type-options','strict-transport-security','referrer-policy','permissions-policy'].map(key=>[key,'test']))};return new Response(mutation==='content'&&path==='/login'?'construction':body,{status:mutation==='asset'&&path.endsWith('.js')?404:200,headers});};}
it('validates synthetic HTML, JS, CSS and headers',async()=>expect(await smokeDeployment('https://fixture.invalid',{fetcher:fixture()})).toMatchObject({passed:true}));
it.each(['asset','content'])('blocks controlled %s failure',async mutation=>expect(smokeDeployment('https://fixture.invalid',{fetcher:fixture(mutation)})).rejects.toThrow(/Smoke failed|Expected/));

it.each([false,true])('uses a zero-row public catalog query when hosted OpenAPI is unavailable (bad body=%s)',async badBody=>{
 const key='header.'+Buffer.from(JSON.stringify({role:'anon'})).toString('base64url')+'.signature';
 const fetcher=async(url,options)=>{
  const parsed=new URL(url);
  if(parsed.pathname==='/auth/v1/settings')return new Response(JSON.stringify({external:{},disable_signup:false}),{headers:{'content-type':'application/json'}});
  if(parsed.pathname.startsWith('/rest/')){
   expect(parsed.pathname).toBe('/rest/v1/foods');expect(parsed.searchParams.get('limit')).toBe('0');
   expect(options.headers.Authorization).toBe('Bearer '+key);
   return new Response(JSON.stringify(badBody?[{id:'must-not-be-returned'}]:[]),{headers:{'content-type':'application/json'}});
  }
  return fixture()(url,options);
 };
 const result=smokeDeployment('https://fixture.invalid',{fetcher,supabaseUrl:'https://project.supabase.co',anonKey:key});
 if(badBody)await expect(result).rejects.toThrow('Unexpected catalog');else await expect(result).resolves.toMatchObject({passed:true});
});

