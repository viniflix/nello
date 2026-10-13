import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';

const fixture=JSON.parse(readFileSync(process.env.NELLO_AGENDA_QA_FIXTURE||'.backend-ci/browser-runtime/fixture.json'));
if(!['http://localhost:54321','http://localhost:4180'].includes(fixture.url))throw Error('Disposable loopback fixture required');
const pro=fixture.personas['nutritionist-a'];
const patient=fixture.personas['patient-a'];
test.use({timezoneId:'America/Los_Angeles'});
async function client(){const api=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});expect((await api.auth.signInWithPassword({email:pro.email,password:fixture.password})).error).toBeNull();return api;}
async function login(page){await page.goto('/login');await page.locator('#email').fill(pro.email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);await page.goto('/nutritionist/agenda');await expect(page.getByRole('heading',{name:'Agenda de Consultas',exact:true})).toBeVisible();}
function removeSyntheticBooking(id,guest){
 const ci=process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true';
 const database=ci?'postgres':process.env.NELLO_AGENDA_QA_DATABASE;
 if(!ci&&!/^nello_qa_wave02_\d+$/.test(database||''))throw Error('Owned disposable database required for fixture cleanup');
 if(!/^[1-9]\d*$/.test(String(id))||!/^[a-f0-9-]{36}$/.test(pro.id)||!/^Synthetic phase2 link [a-f0-9-]{36}$/.test(guest))throw Error('Invalid synthetic cleanup identity');
 execFileSync('docker',['exec','-i','supabase_db_nello-reconstruction','psql','-XAt','-v','ON_ERROR_STOP=1','-U','supabase_admin','-d',database],{input:`begin;
 delete from public.financial_transactions where appointment_id=${id} and nutritionist_id='${pro.id}' and exists(select 1 from public.appointments where id=${id} and nutritionist_id='${pro.id}' and unregistered_patient_name='${guest}');
 delete from public.appointments where id=${id} and nutritionist_id='${pro.id}' and unregistered_patient_name='${guest}';commit;`,stdio:['pipe','pipe','pipe']});
}

test('configured duration and whole slots guide a guest without creating an account',async({page})=>{
 const api=await client();
 const previous=await api.from('user_profiles').select('clinic_settings').eq('id',pro.id).single();expect(previous.error).toBeNull();
 const agenda={startTime:'09:00',endTime:'12:00',slotDuration:45,workingDays:['sunday','monday','tuesday','wednesday','thursday','friday','saturday']};
 try{
  expect((await api.from('user_profiles').update({clinic_settings:{...(previous.data.clinic_settings||{}),agenda}}).eq('id',pro.id)).error).toBeNull();
  await login(page);await page.getByRole('button',{name:'Novo Agendamento',exact:true}).click();
  const form=page.getByRole('dialog');await expect(form.getByLabel('Duração *',{exact:true})).toContainText('45 minutos');
  await form.getByLabel('Data *',{exact:true}).fill('16/10/2034');
  await expect(form.getByText('Jornada 09:00–12:00.',{exact:false})).toBeVisible();
  await form.getByRole('button',{name:'09:45',exact:true}).click();await expect(form.getByLabel('Hora *',{exact:true})).toHaveValue('09:45');
  await form.getByRole('combobox',{name:'Paciente *',exact:true}).fill('Synthetic phase2 guest '+randomUUID());
  await expect(form.getByText('Nome sem cadastro:',{exact:false})).toBeVisible();
  await form.getByLabel('Observações',{exact:true}).fill('Synthetic intact draft');
  await form.getByLabel('Hora *',{exact:true}).fill('08:00');
  await form.getByRole('button',{name:'Agendar',exact:true}).click();
  await expect(form.getByRole('alert')).toContainText('Confirme a exceção');
  await expect(form.getByLabel('Observações',{exact:true})).toHaveValue('Synthetic intact draft');
  await form.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Descartar alterações',exact:true}).click();
 }finally{await api.from('user_profiles').update({clinic_settings:previous.data.clinic_settings}).eq('id',pro.id);await api.auth.signOut();}
});

test('linking a paid guest preserves the charge and opens the exact financial record with return context',async({page})=>{
 const api=await client(),guest='Synthetic phase2 link '+randomUUID();let id;
 try{
  const target=await api.from('user_profiles').select('name').eq('id',patient.id).single();expect(target.error).toBeNull();
  const result=await api.rpc('perform_clinical_operation',{p_operation:'appointment',p_arguments:{p_appointment:{nutritionist_id:pro.id,unregistered_patient_name:guest,start_time:'2034-10-18T12:00:00Z',appointment_time:'2034-10-18T12:00:00Z',duration:60,status:'scheduled'},p_financial:{custom_price:125.75},p_appointment_id:null},p_expected:null,p_nonce:randomUUID(),p_actor:pro.id});
  expect(result.error).toBeNull();id=result.data.appointment.id;
  expect((await api.from('financial_transactions').update({status:'paid',paid_at:new Date().toISOString().slice(0,10)}).eq('id',result.data.transaction.id)).error).toBeNull();
  await login(page);
  const row=page.getByText(guest,{exact:true}).locator('xpath=ancestor::div[@data-appointment-id]');
  await row.getByTitle('Cadastrar Paciente',{exact:true}).click();const modal=page.getByRole('dialog');
  await expect(modal.getByRole('heading',{name:'Completar cadastro do agendamento',exact:true})).toBeVisible();
  await modal.getByRole('combobox',{name:'Paciente cadastrado *',exact:true}).fill(target.data.name);
  await modal.getByRole('option').filter({hasText:target.data.name}).click();
  await modal.getByRole('button',{name:'Confirmar vínculo',exact:true}).click();await expect(modal).toHaveCount(0);
  const appointment=await api.from('appointments').select('patient_id,unregistered_patient_name').eq('id',id).single();
  expect(appointment.data.patient_id).toBe(patient.id);expect(appointment.data.unregistered_patient_name).toBe(guest);
  const charge=await api.from('financial_transactions').select('patient_id,status,amount').eq('appointment_id',id).single();
  expect(charge.data.patient_id).toBe(patient.id);expect(charge.data.status).toBe('paid');expect(Number(charge.data.amount)).toBe(125.75);
  await page.getByRole('button',{name:/125,75.*Pago/}).click();await expect(page).toHaveURL(/\/nutritionist\/financial/);
  await expect(page.getByRole('dialog')).toContainText('125,75');
  await page.getByRole('dialog').getByRole('button',{name:'Fechar detalhes',exact:true}).click();
  await page.getByRole('button',{name:'Voltar à agenda',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist\/agenda/);
  const paidRow=page.getByRole('button',{name:/125,75.*Pago/}).locator('xpath=ancestor::div[@data-appointment-id]');
  await paidRow.getByRole('button',{name:/Mais ações/}).click();
  await page.getByRole('menuitem',{name:'Excluir agendamento',exact:true}).click();
  const deletion=page.getByRole('alertdialog');await deletion.getByRole('button',{name:'Excluir',exact:true}).click();
  await expect(deletion.getByRole('alert')).toBeVisible();await expect(deletion).toBeVisible();
  expect((await api.from('financial_transactions').select('status').eq('appointment_id',id).single()).data.status).toBe('paid');
 }finally{
  if(id)removeSyntheticBooking(id,guest);
  await api.auth.signOut();
 }
});

test('agenda settings provide a return route without carrying a patient name in the URL',async({page})=>{
 await login(page);await page.getByRole('button',{name:'Configurar agenda',exact:true}).click();
 await expect(page).toHaveURL(/\/nutritionist\/profile\?tab=agenda$/);
 await expect(page.getByRole('button',{name:'Voltar à agenda',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Voltar à agenda',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist\/agenda$/);
});
