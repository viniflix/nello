import {test,expect} from '@playwright/test';
import {readdirSync} from 'node:fs';
for(const [width,height] of [[320,640],[640,320],[768,1024],[1024,768],[1440,900],[390,360]])test(`captcha fits ${width}x${height} and resize invalidates old widget`,async({page})=>{
 await page.setViewportSize({width,height});
 await page.route('**/__qa__/captcha.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="pt-BR"><head><title>CAPTCHA sintético</title></head><body><div id="root"></div></body></html>'}));
 await page.goto('/__qa__/captcha.html');
 await page.evaluate(async()=>{
  window.turnstile={render(node,options){const widget=document.createElement('div');widget.setAttribute('data-qa-widget',options.size);widget.style.width=options.size==='compact'?'150px':'300px';widget.style.height=options.size==='compact'?'140px':'65px';widget.textContent='Verificação de segurança sintética';node.append(widget);return widget;},remove(widget){widget.remove();}};
  const harness=await import('/__qa__/harness.js');harness.mountSyntheticCaptcha();
 });
 for(const file of readdirSync('dist/assets').filter(file=>file.endsWith('.css')))await page.addStyleTag({url:`/assets/${file}`});
 await expect(page.locator('[data-qa-widget]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('[data-qa-widget]')).toHaveCount(1);
 await test.info().attach(`captcha-${width}x${height}`,{body:await page.screenshot(),contentType:'image/png'});
 await page.setViewportSize({width:320,height:640});await expect(page.locator('[data-qa-widget]')).toHaveAttribute('data-qa-widget','compact');
 await page.setViewportSize({width:768,height:1024});await expect(page.locator('[data-qa-widget]')).toHaveAttribute('data-qa-widget','flexible');
});
