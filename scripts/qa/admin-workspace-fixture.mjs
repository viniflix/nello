import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from './isolated-runtime.mjs';
import {createClient} from '@supabase/supabase-js';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {totp} from './totp.mjs';
export async function createAdminWorkspaceFixture() {
 assertIsolatedRuntime();
 const status=JSON.parse(execFileSync(supabaseCommand,supabaseArgs(['status','--workdir','.backend-ci','--output','json']),{encoding:'utf8'}));
 if(!/^http:\/\/(?:localhost|127\.0\.0\.1):54321$/.test(status.API_URL))throw Error('Synthetic loopback required');
 const provisionEmail=`admin-workspace-${randomUUID()}@example.invalid`;
 const password='QaSyntheticAdmin2026!';
 const admin=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const result=await admin.auth.admin.createUser({email:provisionEmail,password,email_confirm:true,user_metadata:{name:'QA workspace operator',user_type:'nutritionist',legal_version:'2026-10-01.2',terms_accepted:true,analytics_allowed:false}});
 if(result.error||!result.data.user)throw Error('Synthetic account provisioning failed');
 const id=result.data.user.id;
 // The recovery drill requires a binding to the actual Auth UUID, not just a
 // reserved email domain. Keep that safety guard unchanged for extra personas.
 const email=`${id}@example.invalid`;
 const registered=await admin.auth.admin.updateUserById(id,{email,email_confirm:true});
 if(registered.error||registered.data.user?.email!==email)throw Error('Synthetic recovery identity registration failed');
 execFileSync('docker',['exec','-i','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:`insert into private.admin_operators(user_id,role,grant_reason) values('${id}','owner','Synthetic administrative browser fixture only');`,encoding:'utf8'});
 const client=createClient(status.API_URL,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 if((await client.auth.signInWithPassword({email,password})).error)throw Error('Synthetic login failed');
 const enrolled=await client.auth.mfa.enroll({factorType:'totp',friendlyName:'Nello Admin'});
 if(enrolled.error)throw Error('Synthetic MFA fixture failed');
 const secret=enrolled.data.totp.secret;
 if((await client.auth.mfa.challengeAndVerify({factorId:enrolled.data.id,code:totp(secret)})).error)throw Error('Synthetic MFA verification failed');
 await client.auth.signOut();
 return {email,password,secret,id,productionData:false};
}
