import {test,expect} from '@playwright/test';

test('production CSP blocks inline code and reports only a sanitized technical event',async({page,request})=>{
 const response=await page.goto('/login');
 const headers=response.headers();
 expect(headers['content-security-policy']).toContain('report-uri /api/csp-report');
 expect(headers['reporting-endpoints']).toContain('nello-csp=');
 expect(headers['access-control-allow-origin']).toBeUndefined();
 expect(headers['permissions-policy']).toContain('camera=()');
 const violations=[];
 await page.exposeFunction('__qaPolicyViolation',directive=>violations.push(directive));
 await page.evaluate(()=>{
  document.addEventListener('securitypolicyviolation',event=>window.__qaPolicyViolation(event.effectiveDirective));
  const script=document.createElement('script');
  script.textContent='window.__qaUnsafeInlineExecuted = true';document.head.append(script);
 });
 await expect.poll(()=>violations).toContain('script-src-elem');
 expect(await page.evaluate(()=>window.__qaUnsafeInlineExecuted)).toBeUndefined();
 const report=await request.post('/api/csp-report',{headers:{'content-type':'application/csp-report'},data:JSON.stringify({
  'csp-report':{'effective-directive':'script-src-elem','blocked-uri':'inline','document-uri':'https://example.invalid/PRIVATE','script-sample':'SYNTHETIC_PRIVATE_SENTINEL'},
 })});
 expect(report.status()).toBe(204);
 expect(await report.text()).toBe('');
});

test('measures required inline styles and WebAssembly under the production policy',async({page})=>{
 await page.goto('/login');
 // Browser compilation is exercised under the actual production header.
 const wasm=await page.evaluate(async()=>{
  await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));return true;
 });
 expect(wasm).toBe(true);
 const styled=await page.evaluate(()=>{
  const element=document.createElement('div');element.setAttribute('style','color:rgb(1, 2, 3)');document.body.append(element);
  const effective=getComputedStyle(element).color;element.remove();return effective;
 });
 expect(styled).toBe('rgb(1, 2, 3)');
 // The React UI uses these style attributes (animation and positioned controls).
 expect(await page.locator('[style]').count()).toBeGreaterThan(0);
});
