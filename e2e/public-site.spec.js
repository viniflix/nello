import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {publicInformationPaths} from '../src/features/privacy/publicInformationPaths.js';
import {getRouteMetadata} from '../src/app/router/metadataPolicy.js';

async function audit(page) {
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('.nello-public-site *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,40)})));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify(overflow)).toBe(true);
}
for(const screen of [{width:320,height:800},{width:768,height:480},{width:1440,height:900},{width:320,height:900,zoom:true}])test(`public site navigation, readable content and reflow ${screen.width}${screen.zoom?' zoom200':''}`,async({page,request})=>{
 await page.setViewportSize(screen);await page.emulateMedia({reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.locator('h1')).toContainText('Mais clareza para cuidar.');
 if(screen.zoom)await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
 await audit(page);
 await test.info().attach('public-site-home',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await test.info().attach('public-site-hero',{body:await page.screenshot(),contentType:'image/png'});
 const question=page.locator('.site-faq-list summary').filter({hasText:'Para quem é o Nello?'});await question.focus();await question.press('Enter');
 await expect(page.locator('.site-faq-list details').first()).toHaveAttribute('open','');
 if(screen.width<760){const menu=page.locator('.site-mobile-menu summary');await menu.focus();await menu.press('Enter');await audit(page);await page.getByRole('navigation',{name:'Navegação pública no celular'}).getByRole('link',{name:'Recursos',exact:true}).click();}
 else await page.getByRole('navigation',{name:'Navegação pública',exact:true}).getByRole('link',{name:'Recursos',exact:true}).click();
 await expect(page).toHaveURL(/\/recursos$/);await expect(page.locator('h1')).toContainText('Seu olhar clínico.');
 for(const path of publicInformationPaths.filter(p=>p!=='/')){
  const html=await (await request.get(path)).text(),meta=getRouteMetadata(path);
  expect(html).toContain(`<title>${meta.title}</title>`);expect(html).toContain(`href="${meta.canonical}"`);
  expect(html).toContain(meta.description);expect(html).toContain(path==='/recursos'||path==='/para-pacientes'?'site-hero':'site-subhero');
  await page.goto(path);await expect(page.locator('h1')).toBeVisible();
  if(screen.zoom)await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://nellonutri.com.br'+path);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','index,follow');await audit(page);
  if(path==='/recursos'||path==='/para-pacientes')await test.info().attach('public-site'+path.replaceAll('/','-'),{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 }
 const sitemap=await (await request.get('/sitemap.xml')).text();expect(sitemap).not.toMatch(/\/nutritionist|\/patient\/|\/admin|\/convite/);
 expect(errors).toEqual([]);
});
