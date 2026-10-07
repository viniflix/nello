import {randomUUID} from 'node:crypto';
import {runRace,assertRemoteDatabase} from './concurrency.mjs';

export async function runIntelligenceConcurrency({database,query}) {
 assertRemoteDatabase(database);
 const actor=randomUUID(),id=randomUUID(),nonce=randomUUID();
 query(database,`INSERT INTO auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) VALUES('${actor}','authenticated','authenticated','${actor}@example.invalid',now(),'{"name":"Synthetic race","user_type":"nutritionist"}');
 INSERT INTO private.admin_operators(user_id,role,grant_reason) VALUES('${actor}','operator','Synthetic intelligence concurrency');
 CREATE TABLE IF NOT EXISTS public.c4_concurrency_barrier_control(barrier_key bigint PRIMARY KEY,release boolean NOT NULL);`);
 const payload=JSON.stringify({title:'Synthetic concurrent decision',evidence:'Synthetic evidence only',action:'Investigate concurrent writes',expected:'One confirmed immutable revision',review_on:'2026-10-07',outcome:'planned',result:''});
 const script=n=>`BEGIN;
 SELECT set_config('request.jwt.claim.sub','${actor}',true);
 SELECT set_config('request.jwt.claims','{"sub":"${actor}","role":"authenticated","aal":"aal2"}',true);
 SET LOCAL ROLE authenticated;
 DO $$ BEGIN __BARRIER__ PERFORM public.admin_intelligence_save('decision','${id}',0,'${n}','${payload}'::jsonb,'Synthetic concurrent creation');END $$;COMMIT;`;
 const replay=await runRace({database,label:'intelligence same nonce',key:940001,scripts:[script(nonce),script(nonce)],query,assertPair:(_label,rows)=>{if(rows.some(r=>r.code!==0))throw Error('Intelligence receipt race failed');}});
 if(replay.results.some(r=>r.code!==0))throw Error('Intelligence receipt race failed');
 if(query(database,`SELECT count(*) FROM private.admin_intelligence_events WHERE record_id='${id}';`).trim()!=='1')throw Error('Intelligence replay duplicated history');
 const update=n=>script(n).replace(",0,",",1,").replace('Synthetic concurrent creation','Synthetic concurrent review');
 const assertConflict=(_label,rows)=>{if(rows.filter(r=>r.code===0).length!==1||rows.filter(r=>r.code!==0&&/PT409[\s\S]*intelligence_record_changed/.test(r.output)).length!==1)throw Error('Intelligence CAS race did not reject one stale writer');};
 await runRace({database,label:'intelligence stale revision',key:940002,scripts:[update(randomUUID()),update(randomUUID())],query,assertPair:assertConflict});
 if(query(database,`SELECT revision||':'||(SELECT count(*) FROM private.admin_intelligence_events WHERE record_id='${id}') FROM private.admin_intelligence_records WHERE id='${id}';`).trim()!=='2:2')throw Error('Intelligence concurrent history lost');
 return {passed:true,productionData:false,overlapVerified:true,replayClients:2,logicalCreation:1,revisionClients:2,winners:1,conflicts:1,history:2};
}
