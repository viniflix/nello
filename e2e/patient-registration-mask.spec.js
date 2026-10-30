import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
if(!['http://localhost:54321','http://localhost:4180'].includes(fixture.url))throw Error('Disposable loopback fixture required');

test('registration keeps formatted input, paste and caret edits without sending an invitation',async({page,context})=>{
 const invitations=[];
 page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('/functions/v1/create-patient'))invitations.push(request.method());});
 await page.route('https://viacep.com.br/ws/60000001/json/',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({logradouro:'Rua sintética',bairro:'Bairro sintético',localidade:'Fortaleza',uf:'CE'})}));
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(fixture.password);
 await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/nutritionist/);
 await page.goto('/nutritionist/patients');await page.getByRole('button',{name:'Adicionar Paciente',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 const phone=dialog.getByLabel('Telefone',{exact:true});await phone.pressSequentially('85987654321');await expect(phone).toHaveValue('(85) 98765-4321');
 const cpf=dialog.getByLabel('CPF',{exact:true});await cpf.pressSequentially('12345678900');await expect(cpf).toHaveValue('123.456.789-00');
 await cpf.evaluate(input=>input.setSelectionRange(4,7));await page.keyboard.insertText('987');await expect(cpf).toHaveValue('123.987.789-00');
 await cpf.press('End');await cpf.press('Backspace');expect((await cpf.inputValue()).replace(/\D/g,'')).toBe('1239877890');await page.keyboard.insertText('1');await expect(cpf).toHaveValue('123.987.789-01');
 await cpf.press('ControlOrMeta+A');await cpf.press('Backspace');await expect(cpf).toHaveValue('');
 await page.evaluate(()=>navigator.clipboard.writeText('01234567890'));await cpf.press('ControlOrMeta+V');await expect(cpf).toHaveValue('012.345.678-90');
 const birth=dialog.getByPlaceholder('dd/mm/aaaa');await birth.pressSequentially('02011990');await expect(birth).toHaveValue('02/01/1990');
 await dialog.getByRole('tab',{name:/Endereço/}).click();const cep=dialog.getByLabel('CEP',{exact:true});await cep.pressSequentially('60000001');await expect(cep).toHaveValue('60000-001');
 await dialog.getByRole('tab',{name:/Dados Pessoais/}).click();await expect(cpf).toHaveValue('012.345.678-90');await expect(phone).toHaveValue('(85) 98765-4321');await expect(birth).toHaveValue('02/01/1990');
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(invitations).toEqual([]);
});
