import { assertIsolatedRuntime, supabaseCommand, supabaseArgs } from './isolated-runtime.mjs';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

assertIsolatedRuntime();
const status = JSON.parse(execFileSync(supabaseCommand, supabaseArgs(['status','--workdir','.backend-ci','--output','json']), { encoding:'utf8' }));
const api = new URL(status.API_URL);
assert(['localhost','127.0.0.1'].includes(api.hostname) && ['54321','55321'].includes(api.port), 'Disposable loopback Auth required');
const options = { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } };
const service = createClient(status.API_URL,status.SERVICE_ROLE_KEY,options);
const anon = () => createClient(status.API_URL,status.ANON_KEY,options);
const created=[];
const password='QA1!'+randomBytes(24).toString('hex');
const email=()=>`wave04-${randomUUID()}@example.invalid`;
const legal={legal_version:'2026-10-01.2',terms_accepted:true,analytics_allowed:false};
const sql = input => execFileSync('docker', ['exec','-i','-e','PGPASSWORD=postgres', 'supabase_db_nello-reconstruction',
  'psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-t','-A','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'});
let assertions=0;
try {
  for(const metadata of [{name:'QA no legal'}, {...legal,name:'QA no invite',user_type:'patient'}, {...legal,terms_accepted:'true'}]) {
    const result=await anon().auth.signUp({email:email(),password,options:{data:metadata}});
    if(result.data?.user?.id)created.push(result.data.user.id);
    assert(result.error,'Unauthorized signup or malformed legal acceptance must be denied by the real Auth trigger'); assertions++;
  }
  // Forge every privilege/clinical field through the public endpoint.
  const signup=await anon().auth.signUp({email:email(),password,options:{data:{...legal,name:'QA minimal',
    user_type:'admin',is_admin:true,nutritionist_id:randomUUID(),birth_date:'invalid-date',weight:'bad',
    height:999,observations:'PRIVATE_SYNTHETIC_SENTINEL',needs_password_reset:'not-a-boolean',analytics_allowed:'true'}}});
  assert(!signup.error,'Public signup with ignored untrusted clinical metadata must succeed');
  created.push(signup.data.user.id);
  const {data:profile,error:profileError}=await service.from('user_profiles').select('user_type,is_admin,birth_date,height,weight,nutritionist_id,observations').eq('id',signup.data.user.id).single();
  assert(!profileError);
  assert.deepEqual(profile,{user_type:'nutritionist',is_admin:false,birth_date:null,height:null,weight:null,nutritionist_id:null,observations:null}); assertions++;
  const {data:verification,error:verificationError}=await service.from('professional_verifications').select('status,valid_until').eq('user_id',signup.data.user.id).single();
  assert(!verificationError); assert.equal(verification.status,'approved'); assert(Date.parse(verification.valid_until)>Date.now()); assertions++;
  const unconfirmed=await anon().auth.signInWithPassword({email:signup.data.user.email,password});
  assert(unconfirmed.error?.code==='email_not_confirmed'
    || /email not confirmed/i.test(unconfirmed.error?.message || ''),'Email confirmation must remain enforced'); assertions++;
  // Service confirms only synthetic email; do not require an external SMTP provider for QA.
  const confirmation=await service.auth.admin.updateUserById(signup.data.user.id,{email_confirm:true}); assert(!confirmation.error);
  const user=anon(); const session=await user.auth.signInWithPassword({email:signup.data.user.email,password}); assert(!session.error);
  const clinicalAccess=await user.rpc('get_my_professional_verification'); assert(!clinicalAccess.error); assert.equal(clinicalAccess.data.has_clinical_capacity,true); assertions++;
  const preferences=await user.rpc('get_my_privacy_preferences'); assert(!preferences.error);
  assert.equal(preferences.data.terms_accepted,true);assert.equal(preferences.data.analytics_allowed,false); assertions++;
  assert.equal(preferences.data.version,'2026-10-01.2');assert.equal(preferences.data.analytics_choice_recorded,true);assertions++;
  sql(`delete from private.auth_legal_receipts where user_id='${signup.data.user.id}';`);
  assert(!(await user.rpc('record_my_privacy_choice',{p_version:'2026-10-01',p_terms:true,p_analytics:true})).error);
  const legacy=await user.rpc('get_my_privacy_preferences');assert(!legacy.error);
  assert.equal(legacy.data.terms_accepted,false);assert.equal(legacy.data.analytics_allowed,false);assert.equal(legacy.data.analytics_choice_recorded,false);assertions++;
  const invalid=await user.rpc('record_my_privacy_choice',{p_version:'obsolete',p_terms:true,p_analytics:true}); assert(invalid.error);assertions++;
  for(const allowed of [true,false]) {
    const saved=await user.rpc('record_my_privacy_choice',{p_version:'2026-10-01.2',p_terms:true,p_analytics:allowed});assert(!saved.error);
    const reread=await user.rpc('get_my_privacy_preferences');assert.equal(reread.data.analytics_allowed,allowed);assertions++;
  }
  assert(!(await user.rpc('record_my_privacy_choice',{p_version:'2026-10-01.2',p_terms:true,p_analytics:true})).error);
  assert(!(await user.rpc('record_my_privacy_choice',{p_version:'2026-10-01',p_terms:true,p_analytics:false})).error);
  const oldClientRevocation=await user.rpc('get_my_privacy_preferences');assert(!oldClientRevocation.error);
  assert.equal(oldClientRevocation.data.analytics_allowed,false);assertions++;
  const forbiddenInsert=await user.from('user_profiles').insert({id:randomUUID(),name:'QA forged profile',user_type:'nutritionist',is_admin:true}); assert(forbiddenInsert.error); assertions++;
  const anonymousReceipt=await anon().rpc('record_my_privacy_choice',{p_version:'2026-10-01.2',p_terms:true,p_analytics:true}); assert(anonymousReceipt.error); assertions++;
  const userQuota=await user.rpc('consume_patient_creation_quota',{p_actor:signup.data.user.id});assert(userQuota.error);assertions++;
  for(let i=1;i<=21;i++) {
    const quota=await service.rpc('consume_patient_creation_quota',{p_actor:signup.data.user.id});assert(!quota.error);
    assert.equal(quota.data,i<=20);assertions++;
  }
  const professional = await service.auth.admin.createUser({email:email(),password,email_confirm:true,
    user_metadata:{...legal,name:'QA verified professional',user_type:'nutritionist'}});
  assert(!professional.error); const owner = professional.data.user; created.push(owner.id);
  sql(`update public.professional_verifications set status='approved',verification_method='approved_by_migration',valid_until=now()+interval '1 year' where user_id='${owner.id}';`);
  const professionalClient=anon(); assert(!(await professionalClient.auth.signInWithPassword({email:owner.email,password})).error);
  const {data:professionalSession}=await professionalClient.auth.getSession();
  const invokePatient=async(payload,token=professionalSession.session.access_token)=>{
    const response=await fetch(`${status.API_URL}/functions/v1/create-patient`,{method:'POST',
      headers:{Authorization:`Bearer ${token}`,apikey:status.ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
    return {status:response.status,retryAfter:response.headers.get('Retry-After'),body:await response.json()};
  };
  // Explicit suspension still denies clinical operations during open testing.
  sql(`update public.professional_verifications set status='suspended' where user_id='${signup.data.user.id}';`);
  const pendingSession=(await user.auth.getSession()).data.session;
  const metadata={name:'QA edge patient',birth_date:'1990-01-01',user_type:'patient',nutritionist_id:owner.id};
  const pendingEdge=await invokePatient({email:email(),isOffline:false,metadata:{...metadata,nutritionist_id:signup.data.user.id}},pendingSession.access_token);
  assert.equal(pendingEdge.status,403);assertions++;
  const invalidBody=await invokePatient({email:email(),isOffline:false,metadata:{...metadata,name:123}});assert.equal(invalidBody.status,400);assertions++;
  const wrongNutritionist=await invokePatient({email:email(),isOffline:false,metadata:{...metadata,nutritionist_id:signup.data.user.id}});assert.equal(wrongNutritionist.status,403);assertions++;
  const edgeEmail=email();
  const edgePatient=await invokePatient({email:edgeEmail,isOffline:false,defaultPassword:'IGNORED-CLIENT-PASSWORD!',metadata:{...metadata,is_admin:true,user_type:'patient'}});
  assert.equal(edgePatient.status,200,'Actual Edge must send invitation and derive its credential on server');
  assert.equal(edgePatient.body.initialPasswordAvailable,true);created.push(edgePatient.body.userId);assertions++;
  const edgeProfile=await service.from('user_profiles').select('is_admin,user_type,birth_date').eq('id',edgePatient.body.userId).single();
  assert.deepEqual(edgeProfile.data,{is_admin:false,user_type:'patient',birth_date:'1990-01-01'});assertions++;
  const linkedProfile=await professionalClient.from('user_profiles').select('id').eq('id',edgePatient.body.userId).single();
  assert(!linkedProfile.error,'Invited patient must be visible to the authorized professional immediately');assertions++;
  const careBefore=await professionalClient.rpc('list_nutritionist_care_patients');
  assert(!careBefore.error);assert.equal(careBefore.data.find(p=>p.id===edgePatient.body.userId)?.access_status,'awaiting_email_confirmation');assertions++;
  const episodes=await service.from('care_episodes').select('id,status,nutritionist_id').eq('patient_id',edgePatient.body.userId);
  assert.equal(episodes.data.length,1);assert.equal(episodes.data[0].status,'active');assert.equal(episodes.data[0].nutritionist_id,owner.id);assertions++;
  const availableChat=await professionalClient.rpc('get_patients_for_new_chat',{p_nutritionist_id:owner.id});
  assert(!availableChat.error);assert(availableChat.data.some(p=>p.id===edgePatient.body.userId || p.patient_id===edgePatient.body.userId));assertions++;
  // Confirm only this synthetic recipient to prove the chosen initial credential.
  assert(!(await service.auth.admin.updateUserById(edgePatient.body.userId,{email_confirm:true})).error);
  assert(!(await anon().auth.signInWithPassword({email:edgeEmail,password:'010190'})).error);assertions++;
  const careAfter=await professionalClient.rpc('list_nutritionist_care_patients');
  assert(!careAfter.error);assert.equal(careAfter.data.find(p=>p.id===edgePatient.body.userId)?.access_status,'ready');assertions++;
  assert((await anon().auth.signInWithPassword({email:edgeEmail,password:'IGNORED-CLIENT-PASSWORD!'})).error);assertions++;
  const duplicate=await invokePatient({email:edgeEmail,isOffline:false,metadata});assert.equal(duplicate.status,409);assertions++;
  const forbiddenIntent = await professionalClient.rpc('prepare_patient_auth_invitation',{p_email:email(),p_nutritionist:owner.id});
  assert(forbiddenIntent.error); assertions++;
  const inviteEmail=email();
  const intent=await service.rpc('prepare_patient_auth_invitation',{p_email:inviteEmail,p_nutritionist:owner.id}); assert(!intent.error);
  const invite=await service.auth.admin.inviteUserByEmail(inviteEmail,{data:{name:'QA invited',user_type:'patient',birth_date:'1990-01-01',nutritionist_id:owner.id,nello_provisioning_nonce:intent.data,needs_password_reset:true}});
  assert(!invite.error,'Real Auth invitation must create the clinical patient without trusting client claims');created.push(invite.data.user.id);
  const invitedProfile=await service.from('user_profiles').select('user_type,nutritionist_id,birth_date,needs_password_reset').eq('id',invite.data.user.id).single();
  assert.deepEqual(invitedProfile.data,{user_type:'patient',nutritionist_id:owner.id,birth_date:'1990-01-01',needs_password_reset:true});assertions++;
  assert.equal(sql(`select count(*) from private.patient_auth_intents where nonce='${intent.data}';`).trim(),'0');assertions++;
  const nonceReuse=await anon().auth.signUp({email:email(),password,options:{data:{...legal,user_type:'patient',nello_provisioning_nonce:intent.data}}});
  assert(nonceReuse.error,'Consumed server authorization must not authorize a different signup');assertions++;
  const configured=await service.auth.admin.updateUserById(invite.data.user.id,{password:'010190'});assert(!configured.error);
  const recovery=await service.auth.admin.generateLink({type:'recovery',email:inviteEmail});assert(!recovery.error);
  const invitedClient=anon();const verifiedRecovery=await invitedClient.auth.verifyOtp({token_hash:recovery.data.properties.hashed_token,type:'recovery'});assert(!verifiedRecovery.error);assertions++;
  const tokenReuse=await anon().auth.verifyOtp({token_hash:recovery.data.properties.hashed_token,type:'recovery'});assert(tokenReuse.error);assertions++;
  const birthdayLogin=await anon().auth.signInWithPassword({email:inviteEmail,password:'010190'});assert(!birthdayLogin.error);assertions++;
  assert(!(await invitedClient.auth.updateUser({password})).error);
  assert(!(await anon().auth.signInWithPassword({email:inviteEmail,password})).error);
  assert((await anon().auth.signInWithPassword({email:inviteEmail,password:'010190'})).error);assertions++;

  // Two real authenticated accounts race for one unclaimed offline profile.
  const offlineId=randomUUID(),offlineCode=randomUUID().replaceAll('-','');
  sql(`insert into public.user_profiles(id,name,user_type,nutritionist_id,patient_invite_code) values('${offlineId}','QA offline','patient','${owner.id}','${offlineCode}');insert into public.nutritionist_patients(nutritionist_id,patient_id,status) values('${owner.id}','${offlineId}','active');`);
  const publicDetails=await anon().rpc('get_invite_details',{p_invite_code:offlineCode});assert(!publicDetails.error);
  assert(publicDetails.data.every(row=>Object.values(row).every(value=>value===null)));assertions++;
  const racers=[];
  for(let i=0;i<2;i++) {
    const client=anon();const account=await client.auth.signUp({email:email(),password,options:{data:{...legal,name:'QA offline claimant',user_type:'patient',invite_code:offlineCode}}});
    assert(!account.error);created.push(account.data.user.id);
    assert(!(await service.auth.admin.updateUserById(account.data.user.id,{email_confirm:true})).error);
    assert(!(await client.auth.signInWithPassword({email:account.data.user.email,password})).error);racers.push(client);
  }
  sql(`update private.patient_invite_lifetimes set expires_at=now()-interval '1 second' where profile_id='${offlineId}';`);
  const expired=await racers[0].rpc('redeem_invite_code',{input_code:offlineCode});assert.equal(expired.data.code,'invite_expired');assertions++;
  const wrongOwner=await user.rpc('renew_patient_invitation',{p_patient:offlineId});assert(wrongOwner.error);assertions++;
  const renewed=await professionalClient.rpc('renew_patient_invitation',{p_patient:offlineId});assert(!renewed.error);assert.notEqual(renewed.data.code,offlineCode);assertions++;
  const stale=await racers[0].rpc('redeem_invite_code',{input_code:offlineCode});assert.equal(stale.data.success,false);assertions++;
  sql(`update public.user_profiles set email='other-recipient@example.invalid' where id='${offlineId}';`);
  const wrongRecipient=await racers[0].rpc('redeem_invite_code',{input_code:renewed.data.code});
  assert.equal(wrongRecipient.data.code,'invite_recipient_mismatch');assertions++;
  const wrongRecipientSignup=await anon().auth.signUp({email:email(),password,options:{data:{...legal,user_type:'patient',invite_code:renewed.data.code}}});
  assert(wrongRecipientSignup.error,'A bearer code must not override a known recipient');assertions++;
  sql(`update public.user_profiles set email=null where id='${offlineId}';`);
  const raced=await Promise.all(racers.map(client=>client.rpc('redeem_invite_code',{input_code:renewed.data.code})));
  assert.equal(raced.filter(result=>result.data?.success===true).length,1);assertions++;
  for(const client of racers) {const reused=await client.rpc('redeem_invite_code',{input_code:renewed.data.code});assert.equal(reused.data.success,false);assertions++;}
  assert.equal(sql(`select count(*) from public.user_profiles where id='${offlineId}';`).trim(),'0');assertions++;
  sql(`insert into private.patient_creation_quota(actor,bucket,attempts) values('${owner.id}',floor(extract(epoch from now())/600),20) on conflict(actor) do update set bucket=excluded.bucket,attempts=20;`);
  const edgeLimited=await invokePatient({email:email(),isOffline:false,metadata});
  assert.equal(edgeLimited.status,429);assert.equal(edgeLimited.retryAfter,'600');assertions++;
  mkdirSync('.backend-ci/auth-onboarding-results',{recursive:true});
  writeFileSync('.backend-ci/auth-onboarding-results/result.json',JSON.stringify({passed:true,assertions,realAuth:true,syntheticData:true,productionData:false,capturedAt:new Date().toISOString()},null,2));
  console.log(`PASS: ${assertions} actual Auth/onboarding/privacy/quota assertions, loopback only.`);
} finally {
  for(const id of created) { const removed=await service.auth.admin.deleteUser(id);if(removed.error)throw Error('Synthetic Auth cleanup failed'); }
}
