import {assertIsolatedRuntime,supabaseCommand,supabaseArgs} from '../qa/isolated-runtime.mjs';
import {execFileSync,spawnSync}from'node:child_process';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{assertForwardRestoration}from'./forward-restoration.mjs';import{candidateMigrations}from'./candidate-migrations.mjs';
assertIsolatedRuntime();
const restoration=JSON.parse(readFileSync('.backend-ci/restore-results/result.json'));assertForwardRestoration(restoration);
const db='nello_qa_wave02_103',out='.backend-ci/fault-results';mkdirSync(out,{recursive:true});
const sql=(database,input,user='supabase_admin')=>execFileSync('docker',['exec','-i','-e','PGPASSWORD=postgres','supabase_db_nello-reconstruction','psql','-X','-t','-A','-h','127.0.0.1','-U',user,'-d',database,'-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
try{
 sql('postgres',`create database ${db} template ${restoration.database} owner supabase_admin;`);for(const migration of candidateMigrations())sql(db,migration.content);
 const capture=()=>sql(db,readFileSync('scripts/backend/catalog.sql','utf8'),'postgres');writeFileSync(out+'/expected.json',capture());
 sql(db,'alter table public.growth_records disable row level security;grant select on public.growth_records to anon;');writeFileSync(out+'/injected.json',capture());
 const comparison=spawnSync(process.execPath,['scripts/backend/compare-catalog.mjs',out+'/expected.json',out+'/injected.json',out+'/difference.json'],{encoding:'utf8'});
 const diff=JSON.parse(readFileSync(out+'/difference.json'));if(comparison.status!==1||!diff.some(x=>x.section==='relations'&&x.extra.some(v=>v.name==='growth_records'&&v.rls===false)))throw Error('Catalog gate did not detect controlled RLS/grant failure');
 writeFileSync(out+'/result.json',JSON.stringify({passed:true,productionData:false,controlledFailure:'growth_records RLS disabled and anonymous read granted',gateExitCode:comparison.status,sections:diff.map(x=>x.section),capturedAt:new Date().toISOString()},null,2));console.log('Controlled RLS and grant failure correctly blocked by the actual catalog comparator.');
}finally{sql('postgres',`drop database if exists ${db};`);}
