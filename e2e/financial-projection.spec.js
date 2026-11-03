import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
test('projection reads require its real tab and keep every query scoped to the authenticated nutritionist',async({page})=>{
 const actor=fixture.personas['nutritionist-a'];
 await page.goto('/login');await page.locator('#email').fill(actor.email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/nutritionist/);
 const requests=[];page.on('request',request=>{const url=new URL(request.url()),select=(url.searchParams.get('select')||'').replaceAll(' ','');if(url.pathname==='/rest/v1/financial_transactions'&&['type,amount,net_amount,status','type,amount,net_amount,due_date,transaction_date'].includes(select))requests.push(url);});
 await page.goto('/nutritionist/financial');await expect(page.getByRole('button',{name:'Exportar mês',exact:true})).toBeEnabled();expect(requests).toHaveLength(0);
 await page.getByRole('tab',{name:'Análises',exact:true}).click();await expect(page.getByRole('tab',{name:'Projeção (30 dias)',exact:true})).toBeVisible();expect(requests).toHaveLength(0);
 await page.getByRole('tab',{name:'Projeção (30 dias)',exact:true}).click();const summary=page.locator('summary').filter({hasText:'Dados da projeção de caixa'});await expect(summary).toBeVisible();await summary.click();await expect(page.getByRole('region',{name:'Dados da projeção de caixa'}).locator('tbody tr')).toHaveCount(31);expect(requests.length).toBeGreaterThan(0);
 for(const url of requests)expect(url.searchParams.get('nutritionist_id')).toBe('eq.'+actor.id);
});
