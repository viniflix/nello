// @vitest-environment node
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';

// Scoped reconstruction of the actual authorization helpers. Synthetic tables
// exercise PostgreSQL role/RLS enforcement; this does not certify PostgREST/Auth.
it('denies direct reads/writes for the wrong or inactive actor, and keeps permitted episode history after write revocation',async()=>{
 const db=new PGlite();const source=readFileSync('supabase/migrations/releases/20261001120000_wave05_authorization_boundaries.sql','utf8');
 const extract=name=>{const start=source.indexOf('CREATE OR REPLACE FUNCTION private.'+name+'(');if(start<0)throw new Error('Missing normative authorization helper');const end=source.indexOf('$function$;',source.indexOf('AS $function$',start));return source.slice(start,end+11);};
 const a='00000000-0000-4000-8000-000000000001',p='00000000-0000-4000-8000-000000000002',b='00000000-0000-4000-8000-000000000003',episode='00000000-0000-4000-8000-000000000010';
 try{
 await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table user_profiles(id uuid primary key,is_active boolean);
 create table care_episodes(id uuid primary key,patient_id uuid,nutritionist_id uuid,student_id uuid,supervisor_id uuid,status text,is_simulation boolean);
 create table professional_verifications(user_id uuid,professional_role text,status text,valid_until timestamptz);
 create table student_supervisions(student_id uuid,supervisor_id uuid,status text);
 insert into user_profiles values('${a}',true),('${p}',true),('${b}',true);
 insert into care_episodes values('${episode}','${p}','${a}',null,null,'active',false);
 insert into professional_verifications values('${a}','nutritionist','approved',now()+interval '1 day');`);
 await db.exec(extract('wave05_active_actor'));await db.exec(extract('can_write_active_care_episode'));await db.exec(extract('can_read_care_episode'));
 await db.exec(`create table qa_private_records(id int,care_episode_id uuid);
 insert into qa_private_records values(1,'${episode}');alter table qa_private_records enable row level security;
 create policy qa_read on qa_private_records for select to authenticated using(private.can_read_care_episode(care_episode_id));
 create policy qa_write on qa_private_records for insert to authenticated with check(private.can_write_active_care_episode(care_episode_id));
 grant usage on schema public,private,auth to authenticated;grant select,insert on qa_private_records to authenticated;
 set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`);
 expect((await db.query('select * from qa_private_records')).rows).toHaveLength(1);await db.exec(`insert into qa_private_records values(2,'${episode}')`);
 await db.exec(`select set_config('request.jwt.claim.sub','${b}',false)`);expect((await db.query('select * from qa_private_records')).rows).toHaveLength(0);
 await expect(db.exec(`insert into qa_private_records values(3,'${episode}')`)).rejects.toMatchObject({code:'42501'});
 await db.exec(`reset role;update professional_verifications set status='suspended';set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`);
 expect((await db.query('select * from qa_private_records')).rows).toHaveLength(2);await expect(db.exec(`insert into qa_private_records values(4,'${episode}')`)).rejects.toMatchObject({code:'42501'});
 await db.exec(`reset role;update care_episodes set status='ended';set role authenticated;`);
 expect((await db.query('select * from qa_private_records')).rows).toHaveLength(2);await expect(db.exec(`insert into qa_private_records values(5,'${episode}')`)).rejects.toMatchObject({code:'42501'});
 await db.exec(`reset role;update user_profiles set is_active=false where id='${a}';set role authenticated;`);
 expect((await db.query('select * from qa_private_records')).rows).toHaveLength(0);
 await db.exec(`select set_config('request.jwt.claim.sub','${p}',false)`);expect((await db.query('select * from qa_private_records')).rows).toHaveLength(2);
 await expect(db.exec(`insert into qa_private_records values(6,'${episode}')`)).rejects.toMatchObject({code:'42501'});
 await db.exec('reset role;set role anon;');await expect(db.query('select * from qa_private_records')).rejects.toMatchObject({code:'42501'});
 }finally{await db.close();}
},20000);
