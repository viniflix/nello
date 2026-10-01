import {test,expect}from'@playwright/test';import{createServer}from'node:http';import{controlledRelease}from'../scripts/release/controlled-release.mjs';import{smokeDeployment}from'../scripts/release/smoke.mjs';
test('real HTTP direct production deployment rolls back when its boot asset fails',async()=>{
 const sha='a'.repeat(40),projectId='prj_zbE0dJoJrygKzMBq6nG9o7NdVV3H';let active='dpl_syntheticnew';const events=[];
 const server=createServer((req,res)=>{const path=req.url;const fail=path.startsWith('/production/')&&active==='dpl_syntheticnew'&&path.endsWith('.js');if(fail){res.writeHead(503).end('injected missing asset');return;}const html=path.endsWith('/login');res.writeHead(200,{'content-type':html?'text/html':path.endsWith('.js')?'application/javascript':'text/css'});res.end(html?'<title>Nello</title><div id="root"></div><script src="/assets/main.js"></script><link href="/assets/main.css">':'/* synthetic asset */');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 try{
 const evidence={sha,capturedAt:new Date().toISOString(),project:{id:projectId},candidateDeployment:{projectId,meta:{githubCommitSha:sha},readyState:'READY'},github:{checks:['verify','reconstruct','Vercel installation regression'].map(name=>({name,status:'completed',conclusion:'success'})),runs:[{status:'completed',conclusion:'success'}]}};
 const provider={current:async()=>active,inspect:async id=>({projectId,meta:{githubCommitSha:sha},readyState:'READY',target:'production',url:id+'.fixture.invalid',alias:[]}),promote:async id=>{active=id;events.push('promoted');},rollback:async id=>{active=id;events.push('rolled-back');}};
 const smoke=async base=>smokeDeployment(base,{requireHeaders:false,fetcher:url=>{const u=new URL(url);const scope=u.hostname==='nellonutri.com.br'?'production':u.hostname.split('.')[0];return fetch(`http://127.0.0.1:${port}/${scope}${u.pathname}`);}});
 await expect(controlledRelease({sha,evidence,previous:'dpl_syntheticold',candidate:'dpl_syntheticnew',provider,smoke})).rejects.toThrow('Smoke failed');expect(events).toEqual(['rolled-back']);expect(active).toBe('dpl_syntheticold');expect(await smoke('https://nellonutri.com.br')).toMatchObject({passed:true});
 }finally{await new Promise(resolve=>server.close(resolve));}
});
