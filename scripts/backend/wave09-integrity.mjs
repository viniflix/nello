import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { assertIsolatedRuntime } from '../qa/isolated-runtime.mjs';
import { candidateMigrations } from './candidate-migrations.mjs';
assertIsolatedRuntime();
const runAsync=promisify(execFile);
const database=`nello_qa_wave02_${1000000 + process.pid}`;
const base=['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-h','127.0.0.1','-U','supabase_admin','-v','ON_ERROR_STOP=1'];
const sql=(target,input)=>execFileSync('docker',[...base,'-d',target],{input,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
const actor='10000000-0000-0000-0000-000000000909';
const output='.backend-ci/wave09-results';mkdirSync(output,{recursive:true});
let log='';let passed=false;let created=false;
try {
  sql('postgres',`CREATE DATABASE ${database} TEMPLATE nello_qa_wave02_template OWNER supabase_admin;`);
  created=true;
  const migrations=candidateMigrations();
  for(const migration of migrations.filter(m=>!m.file.includes('wave09_data_integrity')))log+=sql(database,migration.content);
  const migration=migrations.find(m=>m.file.includes('wave09_data_integrity'));
  if(!migration)throw Error('Missing integrity migration');
  const fixture=`
    INSERT INTO auth.users(id,aud,role,email,raw_user_meta_data) VALUES('${actor}','authenticated','authenticated','w9-forward@example.invalid','{"name":"Synthetic","user_type":"nutritionist"}');
    INSERT INTO public.feed_tasks(nutritionist_id,source_type,source_id,title,status,metadata,updated_at) VALUES
    ('${actor}','pending','manual','Older resolution','resolved','{"last_action":"resolved","last_action_at":"2026-09-30T10:00:00Z","audit_history":[{"action":"resolved","at":"2026-09-30T10:00:00Z"}]}','2026-09-30T10:00:00Z'),
    ('${actor}','pending','manual','Newer automatic sighting','open','{}','2026-10-01T10:00:00Z'),
    ('${actor}','pending','latest-action','Earlier snooze','snoozed','{"last_action":"snoozed","last_action_at":"2026-09-30T10:00:00Z"}','2026-09-30T10:00:00Z'),
    ('${actor}','pending','latest-action','Later resolution','resolved','{"last_action":"resolved","last_action_at":"2026-10-01T10:00:00Z"}','2026-10-01T10:00:00Z'),
    ('${actor}','pending','automatic','Older automatic','open','{"last_action_at":"not-a-timestamp"}','2026-09-30T10:00:00Z'),
    ('${actor}','pending','automatic','Newer automatic','open','{}','2026-10-01T10:00:00Z'),
    ('${actor}','pending',NULL,'Unknown origin 1','open','{}','2026-09-30T10:00:00Z'),
    ('${actor}','pending',NULL,'Unknown origin 2','open','{}','2026-10-01T10:00:00Z');
    CREATE TEMP TABLE before_tasks AS SELECT * FROM public.feed_tasks;
  `;
  const assertions=`
    DO $check$ BEGIN
    IF (SELECT count(*) FROM public.feed_tasks)<>8 OR (SELECT count(*) FROM public.feed_tasks WHERE is_current)<>5 THEN RAISE EXCEPTION 'history_row_loss';END IF;
    IF EXISTS(SELECT 1 FROM before_tasks b JOIN public.feed_tasks f USING(id) WHERE to_jsonb(b) IS DISTINCT FROM (to_jsonb(f)-'is_current')) THEN RAISE EXCEPTION 'legacy_payload_or_timestamp_modified';END IF;
    IF (SELECT title FROM public.feed_tasks WHERE is_current AND source_id='manual')<>'Older resolution'
     OR (SELECT title FROM public.feed_tasks WHERE is_current AND source_id='latest-action')<>'Later resolution'
     OR (SELECT title FROM public.feed_tasks WHERE is_current AND source_id='automatic')<>'Newer automatic' THEN RAISE EXCEPTION 'wrong_canonical_rule';END IF;
    END $check$;
  `;
  log+=sql(database,fixture+ migration.content+assertions);
  log+=sql(database,readFileSync('supabase/tests/wave09_data_integrity.sql','utf8'));
  const nonce='50000000-0000-0000-0000-000000000909';
  const call=`SELECT set_config('request.jwt.claim.sub','${actor}',false);SET ROLE authenticated;
    SELECT public.save_feed_task('{"nutritionist_id":"${actor}","source_type":"pending","source_id":"concurrent","title":"Synthetic"}',NULL,'resolved','${nonce}','${actor}')->>'id';`;
  const results=await Promise.all(Array.from({length:4},()=>runAsync('docker',[...base.filter(arg=>arg!=='-i'),'-d',database,'-At','-c',call],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024})));
  const ids=results.map(result=>result.stdout.trim().split(/\r?\n/).at(-1));
  if(new Set(ids).size!==1)throw Error('Concurrent same-nonce task duplication');
  log+=sql(database,`DO $check$ BEGIN IF (SELECT count(*) FROM public.feed_tasks WHERE source_id='concurrent' AND is_current)<>1
   OR (SELECT jsonb_array_length(metadata->'audit_history') FROM public.feed_tasks WHERE source_id='concurrent' AND is_current)<>1 THEN RAISE EXCEPTION 'concurrent_duplicate_or_audit';END IF;END $check$;`);
  passed=true;
  writeFileSync(output+'/result.json',JSON.stringify({passed,capturedAt:new Date().toISOString(),productionData:false,migration:migration.file,sha256:migration.sha256,
    preservedLegacyRows:8,archivedDuplicates:3,currentRows:5,concurrentClients:4,distinctResults:1},null,2));
  console.log('PASS: forward reconciliation preserves all history; four concurrent retries produce one task and one explicit action.');
}catch(error){log+=String(error.stdout||'')+String(error.stderr||error.message);throw error;}
finally{writeFileSync(output+'/validation.log',log);if(created)sql('postgres',`DROP DATABASE IF EXISTS ${database};`);if(!passed)writeFileSync(output+'/result.json',JSON.stringify({passed:false,capturedAt:new Date().toISOString(),productionData:false}));}
