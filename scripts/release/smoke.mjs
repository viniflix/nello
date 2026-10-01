import {pathToFileURL}from'node:url';
export async function smokeDeployment(base,{fetcher=fetch,supabaseUrl,anonKey,headers={},requireHeaders=true}={}){
 const results=[];const get=async(url,type)=>{const r=await fetcher(url,{headers,signal:AbortSignal.timeout(20000)});const body=await r.text();if(!r.ok||!r.headers.get('content-type')?.includes(type))throw Error('Smoke failed: '+new URL(url).pathname+' status/type');results.push({path:new URL(url).pathname,status:r.status});return{r,body};};
 const {r,body}=await get(new URL('/login',base),'text/html');if(!/id=["']root["']/.test(body)||!/<title>[^<]*Nello/i.test(body))throw Error('Expected Nello SPA missing');
 if(requireHeaders)for(const key of ['content-security-policy','x-content-type-options','strict-transport-security','referrer-policy','permissions-policy'])if(!r.headers.get(key))throw Error('Missing header: '+key);
 const js=body.match(/<script[^>]+src=["']([^"']+\.js)["']/)?.[1];const css=body.match(/<link[^>]+href=["']([^"']+\.css)["']/)?.[1];if(!js||!css)throw Error('Missing boot assets');
 for(const [asset,type]of[[js,'javascript'],[css,'text/css']]){const url=new URL(asset,base);if(url.origin!==new URL(base).origin)throw Error('Unexpected external boot asset');await get(url,type);}
 if(supabaseUrl&&anonKey){
  const publicHeaders={apikey:anonKey,...(anonKey.split('.').length===3?{Authorization:'Bearer '+anonKey}:{})};
  const auth=await fetcher(new URL('/auth/v1/settings',supabaseUrl),{headers:publicHeaders,signal:AbortSignal.timeout(20000)});
  if(!auth.ok||!auth.headers.get('content-type')?.includes('json'))throw Error('Public Auth settings unavailable');
  const config=await auth.json();if(!config.external||typeof config.disable_signup!=='boolean')throw Error('Unexpected Auth settings shape');
  results.push({path:'/auth/v1/settings',status:auth.status});
  const apiPath='/rest/v1/foods?select=id&limit=0';
  const api=await fetcher(new URL(apiPath,supabaseUrl),{headers:publicHeaders,signal:AbortSignal.timeout(20000)});
  if(!api.ok||!api.headers.get('content-type')?.includes('json'))throw Error('Supabase zero-row catalog probe unavailable');
  const data=await api.json();if(!Array.isArray(data)||data.length!==0)throw Error('Unexpected catalog probe response');
  results.push({path:apiPath,status:api.status});
 }
 return{passed:true,capturedAt:new Date().toISOString(),results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await smokeDeployment(process.argv[2],{supabaseUrl:process.env.VITE_SUPABASE_URL,anonKey:process.env.VITE_SUPABASE_ANON_KEY});console.log(JSON.stringify(result));}
