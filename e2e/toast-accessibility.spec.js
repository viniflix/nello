import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readdirSync} from 'node:fs';
test.beforeEach(async({page})=>{
  await page.route('**/__qa__/toast.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><head><title>Avisos sintéticos</title></head><body><div id="root"></div></body></html>'}));
  await page.goto('/__qa__/toast.html');
  await page.evaluate(async()=>(await import('/__qa__/harness.js')).mountSyntheticToast());
  for(const file of readdirSync('dist/assets').filter(file=>file.endsWith('.css')))await page.addStyleTag({url:`/assets/${file}`});
});
for(const width of [320,390,768,1024,1440])test(`active toast remains accessible and keyboard usable at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.getByRole('button',{name:'Mostrar aviso',exact:true}).click();
  await expect(page.getByText('Orientação sintética para continuar.',{exact:true})).toBeVisible();
  const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  await test.info().attach('active-toast-axe',{body:JSON.stringify(axe.violations),contentType:'application/json'});
  expect(axe.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press('F8');await expect(page.getByRole('region',{name:'Notifications (F8)'}).locator('ol')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('listitem')).toBeFocused();
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Continuar',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');await expect(page.getByLabel('Ações realizadas')).toHaveText('1');
  await expect(page.getByText('Orientação sintética para continuar.',{exact:true})).not.toBeVisible();
});
test('modal focus and toast dismissal recover the dialog trigger',async({page})=>{
  const trigger=page.getByRole('button',{name:'Abrir diálogo',exact:true});await trigger.click();
  const dialog=page.getByRole('dialog',{name:'Diálogo sintético'});await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'Avisar no diálogo',exact:true}).click();
  await expect(page.getByText('Orientação sintética para continuar.',{exact:true})).toBeVisible();
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.getByRole('button',{name:'Fechar aviso',exact:true}).click();
  await dialog.getByRole('button',{name:'Avisar no diálogo',exact:true}).focus();
  await page.keyboard.press('Shift+Tab');await expect.poll(()=>page.evaluate(()=>!!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(trigger).toBeFocused();
});
test('temporary toast pauses while focused and dismisses after focus leaves',async({page})=>{
  await page.getByRole('button',{name:'Aviso temporário',exact:true}).click();
  await expect(page.getByText('Orientação sintética para continuar.',{exact:true})).toBeVisible();
  await page.keyboard.press('F8');await expect(page.getByRole('region',{name:'Notifications (F8)'}).locator('ol')).toBeFocused();
  await page.waitForTimeout(1100);
  await expect(page.getByText('Orientação sintética para continuar.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mostrar aviso',exact:true}).focus();
  await page.mouse.move(10,10);
  await expect(page.getByText('Orientação sintética para continuar.',{exact:true})).not.toBeVisible();
});
