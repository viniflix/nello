import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';

const fixture = JSON.parse(readFileSync(process.env.NELLO_AGENDA_QA_FIXTURE || '.backend-ci/browser-runtime/fixture.json'));
if (!['http://localhost:54321', 'http://localhost:4180'].includes(fixture.url)) throw Error('Disposable loopback fixture required');
const pro = fixture.personas[fixture.url.endsWith(':4180') ? 'nutritionist-a' : 'nutritionist-b'];
async function client() {
    const result = createClient(fixture.url, fixture.anonKey, {auth:{persistSession:false,autoRefreshToken:false}});
    expect((await result.auth.signInWithPassword({email:pro.email,password:fixture.password})).error).toBeNull();
    return result;
}
async function seed(api, day, status='scheduled', financial={}) {
    const name='Synthetic agenda '+randomUUID();
    const payload={nutritionist_id:pro.id,patient_id:null,unregistered_patient_name:name,appointment_time:`2032-07-${day}T12:00:00Z`,start_time:`2032-07-${day}T12:00:00Z`,duration:60,appointment_type:'first_appointment',status:'scheduled'};
    const created=await api.rpc('perform_clinical_operation',{p_operation:'appointment',p_arguments:{p_appointment:payload,p_financial:financial,p_appointment_id:null},p_expected:null,p_nonce:randomUUID(),p_actor:pro.id});
    expect(created.error).toBeNull();
    let appointment=created.data.appointment;
    if(status!=='scheduled') {
        const changed=await revise(api,appointment,{status});
        expect(changed.error).toBeNull(); appointment=changed.data.appointment;
    }
    return appointment;
}
function revise(api, appointment, changes) {
    return api.rpc('perform_clinical_operation',{p_operation:'appointment',p_arguments:{p_appointment:{...appointment,...changes},p_financial:{},p_appointment_id:appointment.id},p_expected:appointment.updated_at,p_nonce:randomUUID(),p_actor:pro.id});
}
async function login(page) {
    await page.goto('/login'); await page.locator('#email').fill(pro.email); await page.locator('#password').fill(fixture.password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click(); await expect(page).toHaveURL(/\/nutritionist/);
    await page.goto('/nutritionist/agenda'); await expect(page.getByRole('heading',{name:'Agenda de Consultas',exact:true})).toBeVisible();
}
async function edit(page, appointment) {
    const row=page.getByText(appointment.unregistered_patient_name,{exact:true}).locator('xpath=ancestor::div[@data-appointment-id]');
    await row.getByTitle('Editar agendamento',{exact:true}).click();
    return page.getByRole('dialog');
}

test('editing transports revision, preserves evaluation and pending charge, and moves both timestamps',async({page})=>{
    const api=await client(), appointment=await seed(api,'12','scheduled',{custom_price:'85.25'});
    await login(page); const form=await edit(page,appointment);
    await form.getByLabel('Hora *',{exact:true}).fill('11:30');
    await form.getByLabel('Tipo *',{exact:true}).click(); await page.getByRole('option',{name:'Avaliação',exact:true}).click();
    await form.getByRole('button',{name:'Salvar alterações',exact:true}).click(); await expect(form).toHaveCount(0);
    const stored=await api.from('appointments').select('appointment_time,start_time,appointment_type,updated_at').eq('id',appointment.id).single();
    expect(stored.error).toBeNull(); expect(stored.data.appointment_type).toBe('evaluation');
    expect(new Date(stored.data.start_time).toISOString()).toBe('2032-07-12T14:30:00.000Z');
    expect(stored.data.start_time).toBe(stored.data.appointment_time); expect(stored.data.updated_at).not.toBe(appointment.updated_at);
    const charge=await api.from('financial_transactions').select('amount,status,due_date').eq('appointment_id',appointment.id).single();
    expect(charge.error).toBeNull(); expect(Number(charge.data.amount)).toBe(85.25); expect(charge.data.status).toBe('pending');
    expect(charge.data.due_date).toBe('2032-07-12'); await api.auth.signOut();
});

test('stale edit keeps draft and does not overwrite the other session',async({page})=>{
    const api=await client(), appointment=await seed(api,'13'); await login(page); const form=await edit(page,appointment);
    expect((await revise(api,appointment,{notes:'Synthetic other session'})).error).toBeNull();
    await form.getByLabel('Observações',{exact:true}).fill('Synthetic preserved draft');
    await form.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await expect(form.getByRole('alert')).toContainText('mudou'); await expect(form.getByLabel('Observações',{exact:true})).toHaveValue('Synthetic preserved draft');
    await expect(form.getByRole('button',{name:'Salvar alterações',exact:true})).toBeEnabled();
    expect((await api.from('appointments').select('notes').eq('id',appointment.id).single()).data.notes).toBe('Synthetic other session'); await api.auth.signOut();
});

test('cancelled interval permits another appointment and terminal details cannot be submitted',async({page})=>{
    const api=await client(), cancelled=await seed(api,'14','cancelled'), next=await seed(api,'14');
    await login(page); let form=await edit(page,cancelled);
    await expect(form.getByRole('heading',{name:'Detalhes do agendamento'})).toBeVisible();
    await expect(form.getByRole('button',{name:'Salvar alterações'})).toHaveCount(0);
    await form.locator('form').getByRole('button',{name:'Fechar',exact:true}).click(); form=await edit(page,next);
    await form.getByLabel('Tipo *',{exact:true}).click(); await page.getByRole('option',{name:'Presencial',exact:true}).click();
    await form.getByRole('button',{name:'Salvar alterações',exact:true}).click(); await expect(form).toHaveCount(0);
    expect((await api.from('appointments').select('appointment_type').eq('id',next.id).single()).data.appointment_type).toBe('in_person'); await api.auth.signOut();
});

test('save waits for confirmation, prevents duplicate submit and presents permitted states',async({page})=>{
    const api=await client(), appointment=await seed(api,'15'); await login(page); const form=await edit(page,appointment);
    await form.getByLabel('Status *',{exact:true}).click();
    await expect(page.getByRole('option',{name:'Realizada',exact:true})).toHaveCount(0);
    await page.getByRole('option',{name:'Confirmada',exact:true}).click();
    let mutations=0;
    await page.route('**/rest/v1/rpc/perform_clinical_operation',async route=>{mutations++;await new Promise(resolve=>setTimeout(resolve,600));await route.continue();});
    await form.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    await expect(form.getByRole('button',{name:'Salvando…',exact:true})).toBeDisabled();
    await expect(form.getByRole('button',{name:'Cancelar',exact:true})).toBeDisabled();
    await expect(form).toHaveCount(0); expect(mutations).toBe(1);
    expect((await api.from('appointments').select('status').eq('id',appointment.id).single()).data.status).toBe('confirmed'); await api.auth.signOut();
});

for(const width of [390,820,1440]) test(`appointment form has labels and usable actions at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:1000}); await login(page); await page.getByRole('button',{name:'Novo Agendamento',exact:true}).click();
    const form=page.getByRole('dialog'); await expect(form.getByLabel('Duração *',{exact:true})).toBeVisible(); await expect(form.getByLabel('Tipo *',{exact:true})).toBeVisible();
    const dateWidth=await form.getByLabel('Data *',{exact:true}).evaluate(element=>element.getBoundingClientRect().width);
    expect(dateWidth).toBeGreaterThanOrEqual(130);
    const primary=form.getByRole('button',{name:'Agendar',exact:true}); await primary.scrollIntoViewIfNeeded();
    const bounds=await primary.boundingBox(); expect(bounds.height).toBeGreaterThanOrEqual(44); expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
    const dimensions=await form.evaluate(element=>({width:element.clientWidth,scroll:element.scrollWidth}));expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width+1);
    await expect(form.getByLabel('Status *',{exact:true})).toHaveCount(0);
});

test('anonymous reads and mismatched mutation actor cannot access the appointment',async()=>{
    const api=await client(), appointment=await seed(api,'16');
    const anonymous=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const read=await anonymous.from('appointments').select('id').eq('id',appointment.id);
    expect(read.data || []).toHaveLength(0);
    const denied=await api.rpc('perform_clinical_operation',{p_operation:'appointment',p_arguments:{p_appointment:{...appointment,notes:'Synthetic forbidden'},p_financial:{},p_appointment_id:appointment.id},p_expected:appointment.updated_at,p_nonce:randomUUID(),p_actor:fixture.personas['patient-a'].id});
    expect(denied.error).not.toBeNull();
    expect((await api.from('appointments').select('notes').eq('id',appointment.id).single()).data.notes).not.toBe('Synthetic forbidden');
    await api.auth.signOut();
});

test('patient home requests only valid upcoming appointment states',async({page})=>{
    const patient=fixture.personas[fixture.url.endsWith(':4180') ? 'patient-a' : 'patient-b'];
    await page.goto('/login'); await page.locator('#email').fill(patient.email); await page.locator('#password').fill(fixture.password);
    const upcoming=page.waitForResponse(response=>response.url().includes('/rest/v1/appointments?') && response.url().includes('limit=1'));
    await page.getByRole('button',{name:'Entrar',exact:true}).click(); await expect(page).toHaveURL(/\/patient/);
    const response=await upcoming;
    expect(new URL(response.url()).searchParams.get('status')).toBe('in.(scheduled,awaiting_confirmation,confirmed)');
    expect(response.ok()).toBe(true);
    const appointments=await response.json();
    for(const appointment of appointments) expect(['scheduled','awaiting_confirmation','confirmed']).toContain(appointment.status);
});
