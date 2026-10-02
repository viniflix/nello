import { assertIsolatedRuntime } from './isolated-runtime.mjs';
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
assertIsolatedRuntime();
const fixture=JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json','utf8'));
fixture.url=fixture.url.replace('localhost','127.0.0.1');
const url=new URL(fixture.url);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.port==='54321');
const sql=input=>execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-t','-A','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8'}).trim();
assert.equal(sql('select count(*) from _realtime.tenants;'),'1');
// Configure the isolated tenant through its API: restarting the CLI image reseeds
// private_only=false, so a direct table update would be a false assurance.
const realtimeContainer=JSON.parse(execFileSync('docker',['inspect','supabase_realtime_nello-reconstruction'],{encoding:'utf8'}))[0];
assert.equal(realtimeContainer.Config.Labels['com.supabase.cli.project'],'nello-reconstruction');
const settings=Object.fromEntries(realtimeContainer.Config.Env.map(entry=>{const i=entry.indexOf('=');return[entry.slice(0,i),entry.slice(i+1)];}));
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60});
const adminJwt=unsigned+'.'+createHmac('sha256',settings.API_JWT_SECRET).update(unsigned).digest('base64url');
const configure=await fetch(fixture.url+'/realtime/v1/api/tenants/realtime-dev',{method:'PUT',headers:{apikey:fixture.anonKey,Authorization:'Bearer '+adminJwt,'Content-Type':'application/json'},body:JSON.stringify({tenant:{private_only:true,presence_enabled:false}})});
assert.equal(configure.status,200,'Isolated Realtime tenant API configuration failed');
assert.equal(sql('select private_only and not presence_enabled from _realtime.tenants;'),'t');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
await sleep(1500);
const results=[],actors=[],channels=[];
const pass=name=>{results.push(name);console.log('PASS Realtime HTTP: '+name);};
const rpc=async(actor,name,args={})=>{const r=await actor.client.rpc(name,{...args,p_actor:actor.id});assert(!r.error,`${name}: ${r.error?.message}`);return r.data;};
async function actor(key){const client=createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});const r=await client.auth.signInWithPassword({email:fixture.personas[key].email,password:fixture.password});assert(!r.error);const a={client,id:r.data.user.id,events:[]};actors.push(a);await client.realtime.setAuth(r.data.session.access_token);a.topic=await rpc(a,'get_realtime_inbox');return a;}
async function subscribe(a,topic=a.topic,privateChannel=true){return new Promise(resolve=>{const channel=a.client.channel(topic,{config:{private:privateChannel,broadcast:{ack:true},presence:{enabled:false}}}).on('broadcast',{event:'changed'},event=>a.events.push(event.payload));channels.push([a.client,channel]);let done=false;const timer=setTimeout(()=>{if(!done){done=true;resolve({status:'TIMEOUT',channel});}},12000);channel.subscribe((status,error)=>{if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT'].includes(status)&&!done){done=true;clearTimeout(timer);resolve({status,channel,error:error?.message});}});});}
const pro=await actor('nutritionist-a'),patient=await actor('patient-a'),foreign=await actor('nutritionist-b'),tab2=await actor('patient-a');
try {
 const joins=[];for(const a of actors){const join=await subscribe(a);assert.equal(join.status,'SUBSCRIBED',join.error);joins.push(join);assert(!a.topic.includes(a.id));}pass('four real private inbox sockets, opaque topics and two tabs');
 const foreignJoin=await subscribe(foreign,pro.topic);assert.equal(foreignJoin.status,'CHANNEL_ERROR');await foreign.client.removeChannel(foreignJoin.channel);
 const anonymous={client:createClient(fixture.url,fixture.anonKey,{auth:{persistSession:false,autoRefreshToken:false}}),events:[]};actors.push(anonymous);
 const anonymousJoin=await subscribe(anonymous,pro.topic);assert.equal(anonymousJoin.status,'CHANNEL_ERROR');await anonymous.client.removeChannel(anonymousJoin.channel);
 const publicJoin=await subscribe(pro,'platform-presence',false);assert.equal(publicJoin.status,'CHANNEL_ERROR');await pro.client.removeChannel(publicJoin.channel);pass('unrelated and anonymous private joins and legacy public presence are rejected');
 assert.notEqual(await joins[0].channel.send({type:'broadcast',event:'changed',payload:{kind:'chat',forged:true}}),'ok');pass('client cannot publish forged inbox Broadcast');
 const nonce=randomUUID(),params={p_recipient:patient.id,p_message:'Synthetic Wave 8 retry',p_type:'text',p_client_id:nonce};
 const [one,two]=await Promise.all([rpc(pro,'send_chat_message',params),rpc(pro,'send_chat_message',params)]);assert.equal(one.id,two.id);assert.equal(one.from_id,pro.id);await sleep(600);
 assert(patient.events.some(e=>e.kind==='chat'));assert(tab2.events.some(e=>e.kind==='chat'));assert(!foreign.events.some(e=>e.kind==='chat'));
 assert.equal(sql(`select count(*) from public.chats where from_id='${pro.id}' and client_message_id='${nonce}';`),'1');pass('concurrent retry produces one server-bound message and reaches both related tabs only');
 const forged=await pro.client.rpc('send_chat_message',{...params,p_actor:foreign.id});assert(forged.error);pass('account-switch request is denied by the server');
 const lease1=randomUUID(),lease2=randomUUID();await rpc(patient,'update_chat_presence',{p_session:lease1,p_recipient:pro.id,p_typing:true});await rpc(tab2,'update_chat_presence',{p_session:lease2});
 let peers=await rpc(pro,'get_chat_presence');assert(peers.some(p=>p.id===patient.id&&p.online&&p.typing));assert((await rpc(foreign,'get_chat_presence')).every(p=>p.id!==patient.id));
 await rpc(patient,'update_chat_presence',{p_session:lease1,p_online:false});peers=await rpc(pro,'get_chat_presence');assert(peers.some(p=>p.id===patient.id&&p.online&&!p.typing));pass('typing is recipient-scoped and closing one tab preserves the other lease');
 const reconnect=joins[1].channel;await patient.client.removeChannel(reconnect);await sleep(500);assert.equal((await subscribe(patient)).status,'SUBSCRIBED');const replay=await rpc(patient,'list_chat_messages',{p_recipient:pro.id});assert(replay.messages.some(m=>m.id===one.id));pass('reconnect reconciles missed data with the paginated API');
 await rpc(patient,'mark_chat_read',{p_recipient:pro.id,p_through_id:one.id});await rpc(patient,'mark_chat_read',{p_recipient:pro.id,p_through_id:one.id});
 const note=sql(`select id from public.notifications where user_id='${patient.id}' and type='new_message' order by id desc limit 1;`);assert(note);await rpc(patient,'mutate_own_notifications',{p_ids:[note],p_remove:true});await rpc(patient,'mutate_own_notifications',{p_ids:[note],p_remove:true});pass('read and delete are idempotent across tabs');
 sql(`update public.nutritionist_patients set status='ended' where patient_id='${patient.id}' and nutritionist_id='${pro.id}';`);
 assert.deepEqual(await rpc(pro,'get_chat_presence'),[]);assert.deepEqual(await rpc(patient,'get_chat_presence'),[]);
 assert((await patient.client.rpc('update_chat_presence',{p_session:lease2,p_recipient:pro.id,p_typing:true,p_actor:patient.id})).error);
 assert((await pro.client.rpc('send_chat_message',{...params,p_client_id:randomUUID(),p_actor:pro.id})).error);
 assert((await rpc(patient,'list_chat_messages',{p_recipient:pro.id})).messages.some(m=>m.id===one.id));pass('ended relationship revokes new sends and presence on an open socket while preserving history');
 for(const a of actors)for(const payload of a.events){const {id,...signal}=payload;assert.deepEqual(Object.keys(signal),['kind']);if(id){assert.match(id,/^[0-9a-f-]{36}$/i);assert(!actors.some(actor=>actor.id===id));}assert(['chat','notifications','presence','profile','clinical','access'].includes(payload.kind));}pass("wire payload has only an allowed kind and the provider technical event ID");
} finally {
 sql(`update public.nutritionist_patients set status='active' where patient_id='${patient.id}' and nutritionist_id='${pro.id}';`);
 for(const a of actors)await a.client.removeAllChannels();
 mkdirSync('.backend-ci/realtime-results',{recursive:true});writeFileSync('.backend-ci/realtime-results/result.json',JSON.stringify({passed:results.length===10,scenarios:results,capturedAt:new Date().toISOString(),productionData:false,privateOnly:true},null,2));
}
