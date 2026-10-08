import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {publicInformationPaths} from '../src/features/privacy/publicInformationPaths.js';
import {getRouteMetadata} from '../src/app/router/metadataPolicy.js';

test('landing demonstration supports keyboard, pausing and reduced movement',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.goto('/');
 await expect.poll(()=>page.locator('.landing-aurora-green').evaluate(el=>el.getAnimations().some(a=>a.playState==='running'))).toBe(true);
 const demo=page.locator('.landing-demo');await demo.scrollIntoViewIfNeeded();const box=await demo.boundingBox();
 await page.mouse.move(box.x+box.width*.75,box.y+box.height*.45);
 await expect.poll(()=>demo.evaluate(el=>getComputedStyle(el).transform)).toMatch(/^matrix3d/);
 const patient=page.getByRole('button',{name:'Área do paciente',exact:true});await patient.focus();await patient.press('Enter');
 await expect(patient).toHaveAttribute('aria-pressed','true');await expect(page.locator('.landing-demo img')).toHaveAttribute('alt',/Área real do paciente/);
 await expect.poll(()=>page.locator('.landing-demo img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 await page.getByRole('button',{name:'Pausar animações',exact:true}).click();
 await expect.poll(()=>page.locator('.landing-aurora-green').evaluate(el=>el.getAnimations().every(a=>a.playState==='paused'))).toBe(true);
 await expect.poll(()=>demo.evaluate(el=>getComputedStyle(el).transform)).toBe('none');
 const clinical=page.getByRole('button',{name:'Visão clínica',exact:true});await clinical.focus();await clinical.press('Enter');
 await expect(clinical).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.landing-demo img')).toHaveAttribute('alt',/Prontuário real/);
 await expect.poll(()=>page.locator('.landing-demo img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 await expect(page.locator('.landing-demo-workspace')).toHaveCSS('opacity','1');
 await page.getByRole('button',{name:'Ativar animações',exact:true}).click();
 await expect.poll(()=>page.locator('.landing-aurora-green').evaluate(el=>el.getAnimations().some(a=>a.playState==='running'))).toBe(true);
 await expect(page.locator('.landing-hero h1>span')).toHaveCSS('filter','none');
 await expect.poll(()=>page.locator('.landing-hero h1>span').evaluate(el=>el.getAnimations().length)).toBe(0);
 await page.locator('.landing-faq').scrollIntoViewIfNeeded();
 await expect.poll(()=>page.locator('.landing-aurora-green').evaluate(el=>el.getAnimations().every(a=>a.playState==='paused'))).toBe(true);
 await page.getByRole('button',{name:'Pausar animações',exact:true}).scrollIntoViewIfNeeded();
 await expect.poll(()=>page.locator('.landing-aurora-green').evaluate(el=>el.getAnimations().some(a=>a.playState==='running'))).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(page.getByRole('button',{name:'Movimento reduzido'})).toBeDisabled();
 await expect.poll(()=>page.locator('.landing-aurora-green').evaluate(el=>el.getAnimations().length)).toBe(0);
 await expect(page.locator('h1')).toBeVisible();await expect(page).toHaveURL(/\/$/);
});

test('landing initial content and navigation work without JavaScript',async({browser,baseURL})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
 await page.goto(baseURL+'/');await expect(page.locator('h1')).toContainText('O cuidado não termina');
 await expect(page.getByRole('link',{name:'Começar com o Nello',exact:true})).toHaveAttribute('href','/register');
 await expect(page.locator('.landing-demo img')).toBeVisible();
 await expect.poll(()=>page.locator('.landing-demo img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);await context.close();
});

for(const width of [320,768,1440])test(`public design audit: stable captures, research and navigation ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 const capture=page.locator('.landing-capture-workspace');const original=await capture.boundingBox();
 for(const label of ['Visão clínica','Área do paciente','Plano alimentar']){
  await page.getByRole('button',{name:label,exact:true}).click();
  await expect.poll(()=>capture.locator('img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  const next=await capture.boundingBox();expect(Math.abs(next.height-original.height)).toBeLessThan(1);
  if(label==='Área do paciente')await expect.poll(()=>capture.locator('img').evaluate(img=>img.currentSrc)).toMatch(/\/images\/product\/captures-[a-f0-9]{12}\/paciente-inicio-mobile-345\.webp$/);
 }
 await expect(page.locator('.landing-research-authors li')).toHaveCount(5);
 await expect(page.locator('.landing-research')).toContainText('Universidade de Marília');
 await expect(page.locator('.landing-research-advisor')).toContainText('Cláudia Rucco');
 if(width<=760){
  const menu=page.locator('.site-mobile-menu');const summary=menu.locator('summary');
  await summary.click();await page.keyboard.press('Escape');await expect(menu).not.toHaveAttribute('open','');await expect(summary).toBeFocused();
  await summary.click();await page.locator('.landing-hero-for').click();await expect(menu).not.toHaveAttribute('open','');
  await summary.click();await menu.getByRole('link',{name:'Pesquisa',exact:true}).click();
 }else await page.getByRole('navigation',{name:'Navegação pública',exact:true}).getByRole('link',{name:'Pesquisa',exact:true}).click();
 await expect(page).toHaveURL(/\/pesquisa$/);await expect(page.locator('.research-credit-grid article')).toHaveCount(5);
 await page.goto('/para-pacientes');await expect.poll(()=>page.locator('.site-product img').evaluate(img=>img.complete&&img.currentSrc)).toMatch(/\/images\/product\/captures-[a-f0-9]{12}\/paciente-inicio-mobile-345\.webp$/);
});

async function audit(page) {
 for(const image of await page.locator('.product-screenshot img').all()){
  await image.scrollIntoViewIfNeeded();
  await expect.poll(()=>image.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  const mobile=await page.evaluate(()=>innerWidth<=760);
  if(mobile)await expect.poll(()=>image.evaluate(img=>img.currentSrc)).toMatch(/-mobile-(345|360)\.webp$/);
 }
 await page.keyboard.press('Control+Home');
 await page.evaluate(async()=>{await document.fonts.ready;await document.fonts.load('600 24px ClashDisplay');});
 const typography=await page.evaluate(()=>[...document.querySelectorAll('.nello-public-site h1,.nello-public-site h2,.nello-public-site h3')].filter(el=>!el.closest('.site-footer')).flatMap(el=>{
  const style=getComputedStyle(el),size=parseFloat(style.fontSize),issues=[];
  const landing=!!el.closest('.site-landing');
  if((!style.fontFamily.startsWith('ClashDisplay')&&!el.closest('.landing-demo'))||!document.fonts.check('600 24px ClashDisplay'))issues.push('heading font not loaded');
  if(style.textTransform!==(landing?'none':'uppercase'))issues.push('unexpected heading case');
  if(!landing&&(parseFloat(style.letterSpacing)<0||parseFloat(style.wordSpacing)<size*.1))issues.push('compressed heading spacing');
  const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){
   if(parseFloat(getComputedStyle(document.documentElement).fontSize)<32)for(const word of node.textContent.matchAll(/[\p{L}\p{N}]+/gu)){
    const range=document.createRange();range.setStart(node,word.index);range.setEnd(node,word.index+word[0].length);if(range.getClientRects().length>1)issues.push('heading word split across lines');
   }
   for(const match of node.textContent.matchAll(/\S( +)\S/g)){
   const before=document.createRange(),after=document.createRange();before.setStart(node,match.index);before.setEnd(node,match.index+1);after.setStart(node,match.index+1+match[1].length);after.setEnd(node,match.index+2+match[1].length);
   const a=before.getBoundingClientRect(),b=after.getBoundingClientRect();if(Math.abs(a.y-b.y)<1&&b.left-a.right<size*.15)issues.push('words visually crowded');
   }
  }
  return issues.map(issue=>({text:el.textContent,issue}));
 }));
 expect(typography).toEqual([]);
 const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))).toEqual([]);
 const overflow=await page.evaluate(()=>[...document.querySelectorAll('.nello-public-site *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,10).map(el=>({tag:el.tagName,class:el.className,text:el.textContent?.slice(0,40)})));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),JSON.stringify(overflow)).toBe(true);
}
for(const screen of [{width:320,height:800},{width:390,height:844},{width:430,height:932},{width:760,height:480},{width:768,height:480},{width:1440,height:900},{width:320,height:900,zoom:true}])test(`public site navigation, readable content and reflow ${screen.width}${screen.zoom?' zoom200':''}`,async({page,request})=>{
 await page.setViewportSize(screen);await page.emulateMedia({reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.locator('h1')).toContainText('O cuidado não termina');
 if(screen.zoom)await page.evaluate(()=>{document.documentElement.style.fontSize='200%';});
 await audit(page);
 if(screen.width<=760&&!screen.zoom){
  const actions=page.locator('.site-hero-actions .site-action');
  const first=await actions.nth(0).boundingBox(),second=await actions.nth(1).boundingBox();
  expect(Math.abs(first.y-second.y)).toBeLessThan(1);
  expect(first.height).toBeGreaterThanOrEqual(44);expect(second.height).toBeGreaterThanOrEqual(44);
  await expect(actions.nth(0)).toHaveAccessibleName('Criar conta');await expect(actions.nth(1)).toHaveAccessibleName('Ver o Nello');
 }
 await test.info().attach('public-site-home',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await test.info().attach('public-site-hero',{body:await page.screenshot(),contentType:'image/png'});
 if(screen.width<=760&&!screen.zoom)await test.info().attach('mobile-resource-cards',{body:await page.locator('.site-feature-grid').screenshot(),contentType:'image/png'});
 const question=page.locator('.site-faq-list summary').filter({hasText:'Para quem é o Nello?'});await question.focus();await question.press('Enter');
 await expect(page.locator('.site-faq-list details').first()).toHaveAttribute('open','');
 if(screen.width<=760){const menu=page.locator('.site-mobile-menu summary');await menu.focus();const headingBefore=await page.locator('h1').boundingBox();await menu.press('Enter');const headingAfter=await page.locator('h1').boundingBox();expect(Math.abs(headingBefore.y-headingAfter.y)).toBeLessThan(1);await audit(page);await page.getByRole('navigation',{name:'Navegação pública no celular'}).getByRole('link',{name:'Recursos',exact:true}).click();}
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
