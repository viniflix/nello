// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const captured = readFileSync('supabase/reconstruction/20260924231756_live_function_baseline.sql', 'utf8');
const original = captured.match(/CREATE OR REPLACE FUNCTION public\.detach_anamnesis_file\([\s\S]*?\$function\$;/)?.[0];
const owner = '10000000-0000-0000-0000-000000000091';
const other = '10000000-0000-0000-0000-000000000092';
const record = '20000000-0000-0000-0000-000000000091';
const token = '30000000-0000-0000-0000-000000000091';
const wrong = '30000000-0000-0000-0000-000000000092';
const attachment = '40000000-0000-0000-0000-000000000091';
let db;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(`create schema auth; create role anon; create role authenticated;
create function auth.uid() returns uuid language sql as $$
select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid; $$;
create table public.anamnesis_records(id uuid primary key,nutritionist_id uuid,status text,
public_access_token uuid,token_expires_at timestamptz,attachments jsonb,updated_at timestamptz);
alter table public.anamnesis_records enable row level security;
${original}
revoke all on function public.detach_anamnesis_file(uuid,uuid,uuid) from public;
grant execute on function public.detach_anamnesis_file(uuid,uuid,uuid) to anon,authenticated;`);
}, 30000);
afterAll(async () => { await db?.close(); });

async function exercise({ role = 'anon', subject = '', status = 'draft', storedToken = token,
  suppliedToken = null, expires = '2099-01-01T00:00:00Z', attachmentId = attachment } = {}) {
  await db.exec('reset role;');
  await db.query('delete from public.anamnesis_records');
  await db.query(`insert into public.anamnesis_records values ($1,$2,$3,$4,$5,$6,'2026-01-01T00:00:00Z')`,
    [record, owner, status, storedToken, expires, JSON.stringify([{ id: attachment, storage_path: 'qa/synthetic.pdf' }, { id: wrong, storage_path: 'qa/other.pdf' }])]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims','{}',false)", [subject]);
  await db.exec(`set role ${role};`);
  let result;
  let error;
  try {
    result = await db.query('select public.detach_anamnesis_file($1,$2,$3) as payload', [record, suppliedToken, attachmentId]);
  } catch (caught) { error = caught; }
  await db.exec('reset role;');
  const state = (await db.query("select attachments,updated_at = '2026-01-01T00:00:00Z'::timestamptz as unchanged from public.anamnesis_records where id=$1", [record])).rows[0];
  return { result: result?.rows[0].payload, error, state };
}

describe.sequential('detachment authorization through the actual PL/pgSQL function', () => {
  it('demonstrates the captured nullable guard removes a draft attachment without authorization', async () => {
    expect(original).toBeTruthy();
    const outcome = await exercise();
    expect(outcome.error).toBeUndefined();
    expect(outcome.state.attachments).toHaveLength(1);
    expect(outcome.result.storage_path).toBe('qa/synthetic.pdf');
  });
  it('loads the forward correction while preserving the signature and execution grants', async () => {
    const contract = JSON.parse(readFileSync('operations/backend/forward-contracts.json','utf8'));
    await db.exec(readFileSync(contract.detachment.file,'utf8'));
    const permissions = (await db.query(`select has_function_privilege('anon','public.detach_anamnesis_file(uuid,uuid,uuid)','execute') as anon,
has_function_privilege('authenticated','public.detach_anamnesis_file(uuid,uuid,uuid)','execute') as authenticated`)).rows[0];
    expect(permissions).toEqual({ anon: true, authenticated: true });
  });
  it.each([
    { suppliedToken: null }, { suppliedToken: wrong }, { suppliedToken: token, expires: '2020-01-01T00:00:00Z' },
    { status: 'in_progress', storedToken: null, suppliedToken: wrong },
    { role: 'authenticated', subject: other, status: 'in_progress', storedToken: null, suppliedToken: wrong },
    { role: 'authenticated', subject: other },
    { status: 'submitted', suppliedToken: token }, { status: 'completed', suppliedToken: token },
    { status: 'validated', suppliedToken: token },
  ])('rejects unauthorized or closed state without changing stored attachments: %j', async scenario => {
    const outcome = await exercise(scenario);
    expect(outcome.error?.code).toBe('42501');
    expect(outcome.error?.message).toBe('ANAMNESIS_FILE_ACCESS_DENIED');
    expect(outcome.state.attachments).toHaveLength(2);
    expect(outcome.state.unchanged).toBe(true);
  });
  it.each([
    { role: 'authenticated', subject: owner },
    { suppliedToken: token }, { status: 'in_progress', suppliedToken: token },
    { status: 'pending_patient', suppliedToken: token }, { suppliedToken: token, expires: null },
  ])('preserves authorized professional/public token detachment: %j', async scenario => {
    const outcome = await exercise(scenario);
    expect(outcome.error).toBeUndefined();
    expect(outcome.result.storage_path).toBe('qa/synthetic.pdf');
    expect(outcome.result.attachments).toEqual(outcome.state.attachments);
    expect(outcome.state.attachments).toHaveLength(1);
  });
  it('preserves the missing-attachment error after successful authorization', async () => {
    const outcome = await exercise({ role: 'authenticated', subject: owner, attachmentId: token });
    expect(outcome.error?.code).toBe('P0002');
    expect(outcome.error?.message).toBe('ANAMNESIS_FILE_NOT_FOUND');
    expect(outcome.state.attachments).toHaveLength(2);
  });
});
