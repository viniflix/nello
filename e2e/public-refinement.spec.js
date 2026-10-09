import { test, expect } from '@playwright/test';

test('public identity and breadcrumbs agree before and after JavaScript', async ({page,request}) => {
 for(const route of ['/','/recursos','/para-pacientes','/pesquisa','/ajuda','/termos','/privacidade','/seguranca']) {
  const response=await request.get(route);
  expect(response.ok()).toBeTruthy();
  const html=await response.text();
  const serialized=html.match(/<script[^>]*id="nello-public-schema"[^>]*>(.*?)<\/script>/s)?.[1];
  expect(serialized,route).toBeTruthy();
  const expected=JSON.parse(serialized);
  await page.goto(route);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('#nello-public-schema')).toHaveCount(1);
  expect(await page.locator('#nello-public-schema').evaluate(node=>JSON.parse(node.textContent))).toEqual(expected);
 }
 await page.goto('/login');
 await expect(page.locator('#nello-public-schema')).toHaveCount(0);
});

test('document index follows reading in both directions and mobile selection closes the disclosure', async ({page}) => {
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/privacidade');
 await expect(page.locator('.site-document-body')).toBeVisible();
 for(const index of [3,1,2,0]) {
  await page.evaluate(index=>{const element=document.querySelector(`[data-section-index="${index}"]`);window.scrollTo({top:scrollY+element.getBoundingClientRect().top-110,behavior:'instant'});},index);
  await expect(page.locator('.site-document-desktop a[aria-current="location"]')).toHaveAttribute('href',`#document-section-${index}`);
 }
 await page.setViewportSize({width:390,height:900});
 await page.goto('/ajuda');
 const disclosure=page.locator('.site-document-mobile');
 await disclosure.locator('summary').click();
 await disclosure.locator('a[href="#document-section-1"]').click();
 await expect(disclosure).not.toHaveAttribute('open');
 await expect(page).toHaveURL(/#document-section-1$/);
  await expect(disclosure.locator('a[aria-current="location"]')).toHaveAttribute('href','#document-section-1');
 await expect.poll(()=>page.locator('#document-section-1').evaluate(node=>Math.round(node.getBoundingClientRect().top))).toBeGreaterThanOrEqual(60);
 await expect.poll(()=>page.locator('#document-section-1').evaluate(node=>Math.round(node.getBoundingClientRect().top))).toBeLessThanOrEqual(130);
});

test('public support remains a readable tap target on narrow screens', async ({page}) => {
 await page.setViewportSize({width:320,height:900});
 await page.goto('/');
 const support=page.locator('.site-footer a[href^="mailto:"]');
 await expect(support).toHaveText('Falar com o suporte');
 await expect(support).toHaveAttribute('href','mailto:suporte@nellonutri.com.br');
 await support.scrollIntoViewIfNeeded();
 expect(await support.evaluate(node=>node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});
