import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
async function login(page){await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);}

for(const width of [1440,390,320])test(`confirmed dashboard stays silent and stationary during focus refresh ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await login(page);
  const heading=page.getByRole('heading',{name:'Dashboard',exact:true});await expect(heading).toBeVisible();
  await expect(page.locator('main .animate-spin')).toHaveCount(0);
  await page.evaluate(()=>document.fonts.ready);
  await expect.poll(()=>heading.evaluate(el=>getComputedStyle(el.closest('[style]')).transform)).toBe('none');
  const search=page.getByPlaceholder('Pesquisar por paciente...');await expect(search).toBeVisible();
  await search.fill('QA');await search.focus();
  const before=await heading.boundingBox(),scrollBefore=await page.evaluate(()=>window.scrollY);
  const searchBefore=await search.boundingBox();
  let seen=0,release;const gate=new Promise(resolve=>release=resolve),work=[];
  const handler=route=>{seen++;const task=(async()=>{await gate;await route.continue();})();work.push(task);return task;};
  await page.route('**/rest/v1/rpc/get_active_feed_patients',handler);
  // Synthetic focus exercises the read/UX contract, not native Realtime recovery.
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect.poll(()=>seen).toBeGreaterThan(0);
  await expect(page.getByText(/Atualizando/i)).toHaveCount(0);
  await expect(search).toBeFocused();await expect(search).toHaveValue('QA');
  await expect(page.getByText('Carregando...',{exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>window.scrollY)).toBe(scrollBefore);
  expect((await search.boundingBox()).y).toBeCloseTo(searchBefore.y,0);
  const pending=await heading.boundingBox();expect(pending.y).toBeCloseTo(before.y,0);
  await page.screenshot({path:testInfo.outputPath(`dashboard-pending-${width}.png`),fullPage:true});
  release();await Promise.all(work);await page.unroute('**/rest/v1/rpc/get_active_feed_patients',handler);
  await expect(heading).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(async()=>(await heading.boundingBox()).y).toBeCloseTo(before.y,0);
});
