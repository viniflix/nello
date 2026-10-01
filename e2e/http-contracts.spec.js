import {test,expect}from'@playwright/test';import{createClient}from'@supabase/supabase-js';import{readFileSync}from'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {PDFDocument} from 'pdf-lib';
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

test('actual private Storage upload, confirmation and sharing preserve patient boundaries',async()=>{
 const owner=await actor('nutritionist-a'),other=await actor('nutritionist-b'),patientClient=await actor('patient-a');
 const patient=fixture.personas['patient-a'].id;
 const episode=await owner.from('care_episodes').select('id').eq('patient_id',patient).eq('status','active').single();expect(episode.error).toBeNull();
 const pdf=await PDFDocument.create();pdf.addPage([100,100]);const bytes=Buffer.from(await pdf.save());
 const reserved=await owner.rpc('create_clinical_attachment_upload_intent',{p_patient_id:patient,p_care_episode_id:episode.data.id,p_clinical_record_id:null,p_category_code:'report',p_description:'Laudo sintético de QA',p_clinical_date:null,p_original_filename:'qa.pdf',p_mime_type:'application/pdf',p_size_bytes:bytes.length});expect(reserved.error).toBeNull();
 const intent=reserved.data;expect(intent.storage_bucket).toBe('clinical-attachments');
 const foreignUpload=await other.storage.from(intent.storage_bucket).upload(intent.storage_path,bytes,{contentType:'application/pdf'});expect(foreignUpload.error).not.toBeNull();
 const directUpload=await owner.storage.from(intent.storage_bucket).upload(intent.storage_path,bytes,{contentType:'application/pdf'});expect(directUpload.error).not.toBeNull();
 const uploadReservation=await owner.rpc('reserve_storage_upload',{p_bucket:intent.storage_bucket,p_path:intent.storage_path,p_mime:'application/pdf',p_size:bytes.length});expect(uploadReservation.error).toBeNull();
 const upload=await owner.functions.invoke('upload-private-file',{body:new Blob([bytes],{type:'application/pdf'}),headers:{'x-upload-reservation':uploadReservation.data.id}});expect(upload.error).toBeNull();expect(upload.data.sha256).toBe(createHash('sha256').update(bytes).digest('hex'));
 const confirmation=await owner.rpc('confirm_clinical_attachment_upload',{p_attachment_id:intent.attachment_id,p_sha256:upload.data.sha256,p_size_bytes:upload.data.size,p_mime_type:'application/pdf'});expect(confirmation.error).toBeNull();
 for(const outsider of [other,patientClient,client()]){const denied=await outsider.rpc('create_clinical_attachment_signed_url',{p_attachment_id:intent.attachment_id});expect(denied.error).not.toBeNull();}
 const shared=await owner.rpc('change_clinical_attachment_visibility',{p_attachment_id:intent.attachment_id,p_visibility:'shared_with_patient',p_reason:'Compartilhamento sintético solicitado no teste'});expect(shared.error).toBeNull();
 const authorization=await patientClient.rpc('create_clinical_attachment_signed_url',{p_attachment_id:intent.attachment_id});expect(authorization.error).toBeNull();expect(authorization.data.expires_in).toBe(300);
 const signed=await patientClient.storage.from(intent.storage_bucket).createSignedUrl(intent.storage_path,300);expect(signed.error).toBeNull();
 const response=await fetch(signed.data.signedUrl);expect(response.status).toBe(200);expect(Buffer.from(await response.arrayBuffer()).equals(bytes)).toBe(true);
 const foreignRead=await other.storage.from(intent.storage_bucket).download(intent.storage_path);expect(foreignRead.error).not.toBeNull();
});

test('patient creation retries are idempotent and a meal plan survives HTTP readback',async()=>{
 const owner=await actor('nutritionist-a');const request={requestId:randomUUID(),isOffline:true,email:'qa-new@example.invalid',metadata:{name:'QA novo paciente',birth_date:'1990-01-01'}};
 // The public flow authenticates the caller at the Edge boundary; its atomic RPC
 // remains service-role-only. A browser must never be granted direct execution.
 const first=await owner.functions.invoke('create-patient',{body:request});expect(first.error).toBeNull();expect(first.data.userId).toMatch(/^[0-9a-f-]{36}$/);
 const retry=await owner.functions.invoke('create-patient',{body:request});expect(retry.error).toBeNull();expect(retry.data).toEqual(first.data);
 const patientId=first.data.userId;
 const patient=await owner.from('user_profiles').select('id,name').eq('id',patientId);expect(patient.error).toBeNull();expect(patient.data).toEqual([{id:patientId,name:'QA novo paciente'}]);
 const plan=await owner.rpc('create_meal_plan_atomic',{p_plan_data:{patient_id:patientId,name:'QA plano persistido',is_active:false,hybrid:true,days:[]}});expect(plan.error).toBeNull();
 const persisted=await owner.from('meal_plans').select('name,patient_id').eq('id',plan.data).single();expect(persisted.error).toBeNull();expect(persisted.data.name).toBe('QA plano persistido');
 const other=await actor('nutritionist-b');const foreign=await other.from('meal_plans').select('id').eq('id',plan.data);expect(foreign.error).toBeNull();expect(foreign.data).toEqual([]);
});

test('signed canonical clinical artifact generates an actual PDF in Chromium',async({page})=>{
 const owner=await actor('nutritionist-a');const call=async(name,args)=>{const response=await owner.rpc(name,args);expect(response.error,JSON.stringify(response.error)).toBeNull();return response.data;};
 const identity=await call('get_my_document_identity',{});
 await call('save_my_document_identity',{p_payload:{professional_name:'QA Profissional',primary_color:'#416A33',accent_color:'#914604'},p_expected_version:identity.version||0});
 const episode=await owner.from('care_episodes').select('id').eq('patient_id',fixture.personas['patient-a'].id).eq('status','active').single();expect(episode.error).toBeNull();
 const draft=await call('create_clinical_evolution_draft',{p_patient_id:fixture.personas['patient-a'].id,p_episode_id:episode.data.id,p_template_code:'nello_standard',p_encounter_at:new Date().toISOString(),p_visibility:'shared_with_patient',p_retrospective_reason:null});
 const recordId=draft.record_id||draft.id;
 await call('finalize_clinical_record',{p_record_id:recordId,p_content:{conduct:'Orientacao sintetica de QA sem dados reais'},p_expected_revision:draft.revision});
 await call('sign_clinical_record',{p_record_id:recordId});
 const created=await call('create_document_artifact_from_clinical_record',{p_record_id:recordId,p_visibility:'shared_with_patient'});
 await call('finalize_document_artifact',{p_artifact_id:created.artifact_id,p_expected_revision:created.revision});
 await call('sign_document_artifact',{p_artifact_id:created.artifact_id});
 const artifact=await call('get_document_artifact',{p_artifact_id:created.artifact_id});expect(artifact.status).toBe('signed');expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
 await page.goto('/login');
 const pdf=await page.evaluate(async artifact=>{const{renderCanonicalDocumentPdf}=await import('/__qa__/harness.js');const blob=await renderCanonicalDocumentPdf(artifact);return {type:blob.type,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))};},artifact);
 expect(pdf.type).toBe('application/pdf');expect(pdf.bytes.length).toBeGreaterThan(2000);expect(Buffer.from(pdf.bytes).subarray(0,5).toString()).toBe('%PDF-');expect(Buffer.from(pdf.bytes).toString()).toContain('QA patient-a');
});

test('browser File reaches the real verified upload helper and Edge decoder',async({page})=>{
 await page.goto('/login');await page.locator('#email').fill(fixture.personas['nutritionist-a'].email);await page.locator('#password').fill(fixture.password);await page.getByRole('button',{name:'Entrar',exact:true}).click();await expect(page).toHaveURL(/\/nutritionist/);
 const path=fixture.personas['nutritionist-a'].id+'/'+randomUUID()+'.png';
 const result=await page.evaluate(async path=>{
  const {uploadVerifiedFile}=await import('/__qa__/harness.js');
  const canvas=document.createElement('canvas');canvas.width=20;canvas.height=10;canvas.getContext('2d').fillRect(0,0,20,10);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  const verified=await uploadVerifiedFile('avatars',path,new File([blob],'synthetic.png',{type:'image/png'}));
  return {status:verified.status,path:verified.path,hash:verified.sha256,size:verified.size};
 },path);
 expect(result.status).toBe('confirmed');expect(result.path).toBe(path);expect(result.hash).toMatch(/^[a-f0-9]{64}$/);expect(result.size).toBeGreaterThan(0);
});

