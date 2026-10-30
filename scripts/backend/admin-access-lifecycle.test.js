// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('enforces the actual operator/AAL2/active-actor helpers for status and direct SQL reads/writes', async () => {
  const db = new PGlite();
  const foundation = readFileSync('supabase/migrations/20260924065517_admin20_access_foundation.sql','utf8');
  const wave05 = readFileSync('supabase/migrations/releases/20261001120000_wave05_authorization_boundaries.sql','utf8');
  const active = readFileSync('supabase/migrations/releases/20261010154500_security_admin_active_actor.sql','utf8');
  const extract = (source,name) => {
    const start = source.toLowerCase().indexOf('create or replace function '+name+'(');
    if (start < 0) throw Error('missing_actual_helper');
    const tag = source.slice(start).match(/\bas\s+(\$[a-z0-9_]*\$)/i)?.[1];
    if (!tag) throw Error('missing_actual_body');
    const begin = source.indexOf(tag,start), end = source.indexOf(tag+';',begin+tag.length);
    return source.slice(start,end+tag.length+1);
  };
  const operator='00000000-0000-4000-8000-000000000501', other='00000000-0000-4000-8000-000000000502';
  try {
    await db.exec(`create schema private;create schema auth;create role authenticated;create role anon;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('aal',current_setting('qa.aal',true))$$;
      create table public.user_profiles(id uuid,is_active boolean);
      create table private.admin_operators(user_id uuid,revoked_at timestamptz);
      create table private.admin_access_events(operator_id uuid,hour_bucket timestamptz,outcome text,attempts int default 1,last_seen_at timestamptz default now(),unique(operator_id,hour_bucket,outcome));
      insert into public.user_profiles values('${operator}',true),('${other}',true);
      insert into private.admin_operators values('${operator}',null);`);
    for(const [source,name] of [[foundation,'private.admin_member'],[wave05,'private.wave05_active_actor'],[wave05,'private.wave05_require_active_actor'],[active,'private.is_admin'],[foundation,'public.check_is_admin'],[wave05,'public.admin_access_status']])await db.exec(extract(source,name));
    await db.exec(`create table public.qa_admin_rows(id int);insert into public.qa_admin_rows values(1);
      alter table public.qa_admin_rows enable row level security;
      create policy qa_admin on public.qa_admin_rows to authenticated using(private.is_admin()) with check(private.is_admin());
      grant usage on schema public,private,auth to authenticated,anon;grant select,insert on public.qa_admin_rows to authenticated,anon;
      set role authenticated;select set_config('request.jwt.claim.sub','${operator}',false);select set_config('qa.aal','aal1',false);`);
    expect((await db.query('select public.admin_access_status() as s')).rows[0].s).toMatchObject({eligible:true,authorized:false,mfa_required:true});
    expect((await db.query('select * from qa_admin_rows')).rows).toHaveLength(0);
    await expect(db.exec('insert into qa_admin_rows values(2)')).rejects.toMatchObject({code:'42501'});
    await db.exec("select set_config('qa.aal','aal2',false)");
    expect((await db.query('select public.check_is_admin() as allowed')).rows[0].allowed).toBe(true);
    expect((await db.query('select * from qa_admin_rows')).rows).toHaveLength(1);await db.exec('insert into qa_admin_rows values(2)');
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false)`);
    expect((await db.query('select public.admin_access_status() as s')).rows[0].s).toMatchObject({eligible:false,authorized:false});
    expect((await db.query('select * from qa_admin_rows')).rows).toHaveLength(0);
    await db.exec(`reset role;update private.admin_operators set revoked_at=now();set role authenticated;select set_config('request.jwt.claim.sub','${operator}',false)`);
    expect((await db.query('select public.check_is_admin() as allowed')).rows[0].allowed).toBe(false);
    await expect(db.exec('insert into qa_admin_rows values(3)')).rejects.toMatchObject({code:'42501'});
    await db.exec('reset role;update private.admin_operators set revoked_at=null;update user_profiles set is_active=false;set role authenticated;');
    expect((await db.query('select public.check_is_admin() as allowed')).rows[0].allowed).toBe(false);
    await expect(db.exec('select public.admin_access_status()')).rejects.toMatchObject({code:'42501'});
    await db.exec("set role anon;select set_config('request.jwt.claim.sub','',false)");expect((await db.query('select * from qa_admin_rows')).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30_000); // Cold PostgreSQL WASM startup can exceed 5s on a shared CI runner.
