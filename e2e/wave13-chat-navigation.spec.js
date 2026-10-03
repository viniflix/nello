import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
test('chat opens at latest, automatically prepends history and links the patient profile',async({page})=>{
 const actor=fixture.personas['nutritionist-a'],peer=fixture.personas['patient-a'];
 const messages=Array.from({length:65},(_,index)=>({id:String(800000+index),from_id:actor.id,to_id:peer.id,message:`Synthetic scroll ${index}`,message_type:'text',created_at:new Date(Date.UTC(2026,8,1,12,index)).toISOString()}));
 let older=0;
 await page.route('**/rpc/list_chat_messages',async route=>{
  const body=route.request().postDataJSON();const isOlder=Boolean(body.p_before_id);if(isOlder){older++;await new Promise(resolve=>setTimeout(resolve,300));}
  await route.fulfill({json:{messages:isOlder?messages.slice(0,15):messages.slice(15),has_more:!isOlder}});
 });
 await page.goto('/login');await page.locator('#email').fill(actor.email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/nutritionist/);
 await page.goto(`/nutritionist/chat/${peer.id}`);await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeVisible();
 const history=page.getByRole('region',{name:'Histórico de mensagens'});
 await expect.poll(()=>history.evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThan(10);
 await expect(page.getByRole('button',{name:'Carregar mensagens anteriores'})).toHaveCount(0);
 await history.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
 await expect(page.getByRole('status',{name:'Carregando mensagens anteriores'})).toBeVisible();
 await expect(history.getByText('Synthetic scroll 0',{exact:true})).toBeAttached();expect(older).toBe(1);
 await expect.poll(()=>history.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
 const profileLinks=page.locator(`header a[href="/nutritionist/patients/${peer.id}/hub"]`);
 await expect(profileLinks).toHaveCount(2);
 await profileLinks.last().click();await expect(page).toHaveURL(new RegExp(`/patients/${peer.id}/hub`));
});
