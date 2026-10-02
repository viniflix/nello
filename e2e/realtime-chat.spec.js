import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json','utf8'));
async function login(page,key){await page.goto('/login');await page.locator('#email').fill(fixture.personas[key].email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(new RegExp(key.startsWith('patient')?'/patient':'/nutritionist'));}
const patient=fixture.personas['patient-a'].id;
test('chat retains a failed draft and retry is saved and reconciled once across two tabs',async({page,context})=>{
 await login(page,'nutritionist-a');await page.goto(`/nutritionist/chat/${patient}`);const input=page.getByRole('textbox',{name:'Mensagem',exact:true});await expect(input).toBeVisible();
 const second=await context.newPage();await second.goto(`/nutritionist/chat/${patient}`);await expect(second.getByRole('textbox',{name:'Mensagem',exact:true})).toBeVisible();
 let first=true;const requests=[];await page.route('**/rest/v1/rpc/send_chat_message',async route=>{requests.push(route.request().postDataJSON());if(first){first=false;await route.abort('internetdisconnected');}else await route.continue();});
 const text=`Synthetic browser Wave 8 retry ${crypto.randomUUID()}`;await input.fill(text);await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(page.getByText('O rascunho foi mantido. Confira a conexão e tente novamente.',{exact:true})).toBeVisible();await expect(input).toHaveValue(text);
 await page.getByRole('button',{name:'Enviar mensagem',exact:true}).click();await expect(input).toHaveValue('');await expect(page.locator('main').last().getByText(text,{exact:true})).toHaveCount(1);await expect(second.locator('main').last().getByText(text,{exact:true})).toHaveCount(1);
 expect(requests).toHaveLength(2);expect(requests[0].p_client_id).toBe(requests[1].p_client_id);expect(requests[0]).not.toHaveProperty('from_id');
 await second.close();
});
test('switching the chat recipient cannot display the previous conversation',async({page})=>{
 await login(page,'nutritionist-a');await page.goto(`/nutritionist/chat/${patient}`);await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toBeVisible();
 await page.goto(`/nutritionist/chat/${fixture.personas['patient-b'].id}`);await expect(page.getByText('Synthetic browser Wave 8 retry',{exact:true})).toHaveCount(0);await expect(page.getByRole('textbox',{name:'Mensagem',exact:true})).toHaveCount(0);
});
test('patient badge and notification panel share an exact count beyond the 200-row window',async({page})=>{
 const {execFileSync}=await import('node:child_process');const user=fixture.personas['patient-a'].id;
 const sql=input=>execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-t','-A','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'}).trim();
 // Login also schedules a reminder; await its real response before measuring.
 const reminder = page.waitForResponse(response => response.url().includes('/rpc/process_patient_reminders') && response.status() === 200);
 await login(page,'patient-a');await reminder;
 const before=Number(sql(`select count(*) from public.notifications where user_id='${user}' and is_read=false;`));
 await expect.poll(()=>page.evaluate(()=>window.patientNotifications?.unreadCount)).toBe(before);
 try {
  sql(`insert into public.notifications(user_id,type,content) select '${user}','info','{"message":"Synthetic Wave8 count"}'::jsonb from generate_series(1,205);`);
  await expect.poll(()=>page.evaluate(()=>window.patientNotifications?.unreadCount)).toBe(before+205);
  await page.evaluate(()=>window.patientNotifications.showPanel());const panel=page.getByRole('dialog',{name:'Notificações'});await expect(panel).toBeVisible();
  await panel.getByRole('button',{name:'Marcar exibidas',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.patientNotifications?.unreadCount)).toBe(before+5);
  await panel.getByRole('button',{name:'Notificações mais antigas',exact:true}).click();
  await expect(panel.getByText('Synthetic Wave8 count',{exact:true})).toHaveCount(5);
  sql(`insert into public.notifications(user_id,type,content) values('${user}','info','{"message":"Synthetic Wave12 newer"}'::jsonb);`);
  await expect.poll(()=>page.evaluate(()=>window.patientNotifications?.unreadCount)).toBe(before+6);
  await expect(panel.getByText('Synthetic Wave8 count',{exact:true})).toHaveCount(5);
  await expect(panel.getByText('Synthetic Wave12 newer',{exact:true})).toHaveCount(0);
  await panel.getByRole('button',{name:'Notificações mais recentes',exact:true}).click();
  await expect(panel.getByText('Synthetic Wave12 newer',{exact:true})).toBeVisible();
 } finally {sql(`delete from public.notifications where user_id='${user}' and content->>'message' in ('Synthetic Wave8 count','Synthetic Wave12 newer');`);}
});
