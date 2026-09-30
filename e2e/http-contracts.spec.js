import {test,expect}from'@playwright/test';import{createClient}from'@supabase/supabase-js';import{readFileSync}from'node:fs';
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
const client=()=>createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
async function actor(key){const c=client();const {error}=await c.auth.signInWithPassword({email:fixture.personas[key].email,password:fixture.password});expect(error).toBeNull();return c;}
test('real HTTP RLS separates professionals and patients and preserves supported clinical RPCs',async()=>{
 const owner=await actor('nutritionist-a'),other=await actor('nutritionist-b'),patient=fixture.personas['patient-a'].id;
 const links=await owner.from('nutritionist_patients').select('patient_id').eq('patient_id',patient);expect(links.error).toBeNull();expect(links.data).toHaveLength(1);
 const foreign=await other.from('nutritionist_patients').select('patient_id').eq('patient_id',patient);expect(foreign.error).toBeNull();expect(foreign.data).toEqual([]);
 const payload={patient_id:patient,test_name:'QA glicemia',test_value:'90',test_unit:'mg/dL',reference_min:70,reference_max:99,test_date:'2026-09-30'};
 const created=await owner.rpc('create_lab_result_record',{p_payload:payload});expect(created.error).toBeNull();expect(created.data.patient_id).toBe(patient);
 const denied=await other.rpc('create_lab_result_record',{p_payload:payload});expect(denied.error).not.toBeNull();
 const id=created.data.id;const revised=await owner.rpc('revise_lab_result_record',{p_result_id:id,p_payload:{test_value:'91'},p_reason:'Correção sintética conferida no teste QA'});expect(revised.error).toBeNull();expect(revised.data.test_value).toBe('91');
 const direct=await owner.from('lab_results').update({test_value:'92'}).eq('id',id);expect(direct.error?.code).toBe('42501');
 const outsider=await other.from('lab_results').select('id').eq('id',id);expect(outsider.error).toBeNull();expect(outsider.data).toEqual([]);
});
test('anonymous HTTP requests cannot use clinical table APIs or private Storage',async()=>{
 const anon=client();for(const table of ['growth_records','meal_plans','diet_templates']){const result=await anon.from(table).select('*').limit(1);expect(result.error?.code).toBe('42501');}
 const detached=await anon.rpc('detach_anamnesis_file',{p_record_id:'00000000-0000-4000-8000-000000000099',p_attachment_id:'00000000-0000-4000-8000-000000000098',p_token:null});expect(detached.error).not.toBeNull();
 const download=await anon.storage.from('clinical-attachments').download('nonexistent/private-file.pdf');expect(download.data).toBeNull();expect(download.error).not.toBeNull();
});

