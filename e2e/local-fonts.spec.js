import { test, expect } from '@playwright/test';

test('body typography loads every declared weight without third-party font requests',async({page,request})=>{
 const external=[];
 await page.route(url=>['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname),route=>{external.push(new URL(route.request().url()).hostname);return route.abort();});
 await page.goto('/login');await expect(page.getByRole('button',{name:'Entrar',exact:true})).toBeVisible();
 const faces=await page.evaluate(async()=>{await document.fonts.ready;return Promise.all([400,500,600,700].map(async weight=>({weight,count:(await document.fonts.load(weight+' 16px Inter','Nello çãÉ ЖΩ ἄ ắ Ł Ӂ')).length})));});
 expect(faces.every(face=>face.count===7),JSON.stringify(faces)).toBe(true);
 expect(external).toEqual([]);
 const license=await request.get('/fonts/inter/OFL.txt');expect(license.status()).toBe(200);expect(await license.text()).toContain('SIL OPEN FONT LICENSE');
});
