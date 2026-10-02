import {test,expect} from '@playwright/test';
import {mkdirSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
for(const mobile of [false,true])test(`public login has bounded initial work on ${mobile?'slow mobile':'desktop'}`,async({page,context})=>{
 await page.setViewportSize(mobile?{width:390,height:844}:{width:1440,height:900});
 const errors=[],scripts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.resourceType()==='script')scripts.push(r.url());});
 await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',route=>route.fulfill({contentType:'application/javascript',body:''}));
 const session=await context.newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:mobile?4:1});
 await page.addInitScript(()=>{window.__wave12={lcp:0,interactions:[]};new PerformanceObserver(list=>{for(const e of list.getEntries())window.__wave12.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.interactionId)window.__wave12.interactions.push(e.duration);}).observe({type:'event',durationThreshold:16,buffered:true});});
 await page.goto('/login');await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();await page.getByPlaceholder('seu@email.com').first().fill('synthetic@example.invalid');
 await page.getByRole('button',{name:'Preferências de privacidade',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sem analytics',exact:true})).toBeVisible();
 const metrics=await page.evaluate(()=>({...window.__wave12,heap:performance.memory?.usedJSHeapSize||0}));
 mkdirSync('.backend-ci/wave12-results',{recursive:true});
 const output='.backend-ci/wave12-results/performance.json';
 const observations=mobile&&existsSync(output)?JSON.parse(readFileSync(output)).observations:[];
 observations.push({audience:'public',device:mobile?'mobile_cpu4':'desktop',...metrics});
 writeFileSync(output,JSON.stringify({capturedAt:new Date().toISOString(),synthetic:true,observations},null,2));
 expect(metrics.lcp).toBeGreaterThan(0);expect(metrics.lcp).toBeLessThan(mobile?8000:5000);expect(Math.max(0,...metrics.interactions)).toBeLessThanOrEqual(200);expect(metrics.heap).toBeLessThan(80*1024*1024);
 expect(scripts.some(url=>/posthog|replay|jspdf|html2canvas|recharts|AdminLayout/.test(url))).toBe(false);expect(errors).toEqual([]);
});
test('patient grid renders bounded pages and searches records outside the first page',async({page})=>{
 const fixture=JSON.parse(await (await import('node:fs/promises')).readFile('.backend-ci/browser-runtime/fixture.json','utf8'));
 await page.goto('/login');await page.getByPlaceholder('seu@email.com').first().fill(fixture.personas['nutritionist-a'].email);await page.getByPlaceholder('••••••••').first().fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);
 const patients=Array.from({length:1001},(_,index)=>({id:`synthetic-${String(index).padStart(4,'0')}`,name:`Volume patient ${String(index).padStart(4,'0')}`,care_status:'active',access_status:'ready',created_at:'2026-10-01'}));
 await page.route('**/rest/v1/rpc/list_nutritionist_care_patients**',route=>{const query=new URL(route.request().url()).searchParams;const start=Number(query.get('offset')||0),size=Number(query.get('limit')||250);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(patients.slice(start,start+size))});});
 await page.goto('/nutritionist/patients');await expect(page.getByText('Página 1 de 21 · 1001 pacientes')).toBeVisible();await expect(page.getByText('Volume patient 0000',{exact:true})).toBeVisible();await expect(page.getByText('Volume patient 0050',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Próxima',exact:true}).click();await expect(page.getByText('Volume patient 0050',{exact:true})).toBeVisible();await expect(page.getByText('Volume patient 0000',{exact:true})).toHaveCount(0);
 await page.getByPlaceholder('Procurar paciente (Nome, Email, CPF...)').fill('Volume patient 1000');await expect(page.getByText('Volume patient 1000',{exact:true})).toBeVisible();
});
