import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { seed } from '../../e2e/helpers/mealPlanFixture.js';
import { assertIsolatedRuntime, supabaseCommand, supabaseArgs } from './isolated-runtime.mjs';
import { inspectPdf } from './pdf-content.mjs';

assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json'));
assert.equal(fixture.url, 'http://localhost:54321');
const actor = async key => {
  const client = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.equal((await client.auth.signInWithPassword({ email: fixture.personas[key].email, password: fixture.password })).error, null);
  return client;
};
const foreign = await actor('nutritionist-b');
// Keep new care relationships out of shared personas used by Realtime tests.
const status = JSON.parse(execFileSync(supabaseCommand, supabaseArgs(['status', '--workdir', '.backend-ci', '--output', 'json']), { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
assert.equal(status.API_URL, 'http://127.0.0.1:54321');
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const account = await admin.auth.admin.createUser({ email: `${randomUUID()}@example.invalid`, password: fixture.password, email_confirm: true, user_metadata: { user_type: 'nutritionist', name: 'QA PDF canônico', legal_version: '2026-10-01.2', terms_accepted: true, analytics_allowed: false } });
assert.equal(account.error, null);
const ownerId = account.data.user.id;
assert.match(ownerId, /^[a-f0-9-]{36}$/);
const email = `${ownerId}@example.invalid`;
assert.equal((await admin.auth.admin.updateUserById(ownerId, { email, email_confirm: true })).error, null);
const owner = createClient(fixture.url, fixture.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
assert.equal((await owner.auth.signInWithPassword({ email, password: fixture.password })).error, null);
const sql = input => execFileSync('docker', ['exec', '-i', 'supabase_db_nello-reconstruction', 'psql', '-X', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8', timeout: 30000 });
sql(`UPDATE public.professional_verifications SET status='approved',professional_role='nutritionist',crn_region='CRN-3',crn_number='QA-'||user_id::text,normalized_crn='QA'||user_id::text,verification_method='approved_by_migration',valid_until=now()+interval '1 year' WHERE user_id='${ownerId}';`);
const currentIdentity = await owner.rpc('get_my_document_identity');
assert.equal(currentIdentity.error, null);
const identity = await owner.rpc('save_my_document_identity', { p_payload: { professional_name: 'QA Documento congelado' }, p_expected_version: currentIdentity.data.version ?? null });
assert.equal(identity.error, null);
const sample = seed(ownerId), measure = randomUUID();
sql(`INSERT INTO public.food_measures(id,nutritionist_food_id,label,weight_in_grams) SELECT '${measure}',f.food_id,'Colher congelada',15 FROM public.meal_plan_foods f JOIN public.meal_plan_meals m ON m.id=f.meal_plan_meal_id WHERE m.meal_plan_id=${sample.plan} LIMIT 1;
UPDATE public.meal_plan_foods f SET quantity=2,unit='${measure}',calories=30,carbs=7.5,notes='Orientação congelada do alimento' FROM public.meal_plan_meals m WHERE m.id=f.meal_plan_meal_id AND m.meal_plan_id=${sample.plan} AND m.include_in_totals=true;
INSERT INTO public.meal_plan_food_substitutions(meal_plan_food_id,substitute_food_id,quantity,unit,notes) SELECT f.id,f.food_id,20,'gram','Orientação congelada da opção' FROM public.meal_plan_foods f JOIN public.meal_plan_meals m ON m.id=f.meal_plan_meal_id WHERE m.meal_plan_id=${sample.plan} AND m.include_in_totals=true;
UPDATE public.meal_plans SET name='QA MC04 documento sintético',daily_calories=30,daily_carbs=7.5,description='${'Orientação sintética extensa para avaliar paginação. '.repeat(80)}' WHERE id=${sample.plan};`);
const sign = async (plan, legacy = false) => {
  const created = await owner.rpc('create_document_artifact_from_meal_plan', { p_plan_id: plan, p_visibility: 'shared_with_patient' });
  assert.equal(created.error, null);
  const id = created.data.artifact_id;
  let revision = 1;
  if (legacy) {
    // A controlled historical payload omits fields the old capture did not save.
    assert.match(id, /^[a-f0-9-]{36}$/);
    const payload = JSON.parse(sql(`SELECT draft_payload FROM public.document_artifacts WHERE id='${id}';`).trim());
    for (const meal of payload.meals) {
      delete meal.include_in_totals;
      for (const food of meal.foods) for (const key of ['food_snapshot', 'measure_snapshot', 'substitutes', 'notes']) delete food[key];
    }
    const updated = await owner.rpc('update_document_artifact_draft', { p_artifact_id: id, p_payload: payload, p_expected_revision: revision });
    assert.equal(updated.error, null); revision = updated.data.revision;
  }
  assert.equal((await owner.rpc('finalize_document_artifact', { p_artifact_id: id, p_expected_revision: revision })).error, null);
  assert.equal((await owner.rpc('sign_document_artifact', { p_artifact_id: id })).error, null);
  return id;
};
const request = async (client, id, status) => {
  const session = await client.auth.getSession();
  const response = await fetch(fixture.url + '/functions/v1/generate-pdf', { method: 'POST', headers: { authorization: 'Bearer ' + session.data.session.access_token, apikey: fixture.anonKey, origin: 'https://nellonutri.com.br', 'content-type': 'application/json' }, body: JSON.stringify({ documentArtifactId: id, format: 'binary' }), signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, status); return Buffer.from(await response.arrayBuffer());
};
const artifact = await sign(sample.plan);
const before = await owner.rpc('get_document_artifact', { p_artifact_id: artifact });
assert.equal(before.error, null);
const bytes = await request(owner, artifact, 200), pdf = await inspectPdf(bytes), readable = pdf.text.replace(/\s+/g, ' ');
assert(pdf.pages > 1 && pdf.pages <= 50); assert(bytes.length <= 2 * 1024 * 1024);
for (const value of ['Colher congelada', 'Orientação congelada do alimento', 'Orientação congelada da opção', 'não contabilizada', '30 kcal', '7,5 g', 'QA MC04 documento sintético']) assert(readable.includes(value), 'Canonical PDF contains ' + value);
for (const value of ['professional_confirmation', 'source_snapshot', 'responsible_id', 'prepared_by', measure]) assert(!readable.includes(value), 'No internal field in PDF');
await request(foreign, artifact, 404);
sql(`UPDATE public.meal_plans SET daily_calories=999 WHERE id=${sample.plan}; UPDATE public.food_measures SET label='Medida atual alterada',weight_in_grams=25 WHERE id='${measure}';`);
assert.deepEqual((await owner.rpc('get_document_artifact', { p_artifact_id: artifact })).data, before.data);
const again = await inspectPdf(await request(owner, artifact, 200));
assert(again.text.includes('30 kcal')); assert(!again.text.includes('999 kcal')); assert(again.text.includes('Colher congelada')); assert(!again.text.includes('Medida atual alterada'));
const historical = seed(ownerId);
const historicalMeasure = randomUUID();
sql(`INSERT INTO public.food_measures(id,nutritionist_food_id,label,weight_in_grams) SELECT '${historicalMeasure}',f.food_id,'Medida atual alterada',25 FROM public.meal_plan_foods f JOIN public.meal_plan_meals m ON m.id=f.meal_plan_meal_id WHERE m.meal_plan_id=${historical.plan} LIMIT 1;
UPDATE public.meal_plan_foods f SET unit='${historicalMeasure}' FROM public.meal_plan_meals m WHERE m.id=f.meal_plan_meal_id AND m.meal_plan_id=${historical.plan};`);
const oldId = await sign(historical.plan, true), oldBytes = await request(owner, oldId, 200), oldPdf = await inspectPdf(oldBytes);
for (const value of ['100 kcal', 'medida não registrada', 'Composição de fibras e sódio não registrada']) assert(oldPdf.text.includes(value));
assert(!oldPdf.text.includes(historicalMeasure)); assert(!oldPdf.text.includes('Medida atual alterada')); assert(!oldPdf.text.includes('professional_confirmation'));
const output = '.backend-ci/wave10-results'; mkdirSync(output, { recursive: true });
writeFileSync(output + '/canonical-meal-synthetic.pdf', bytes); writeFileSync(output + '/canonical-meal-legacy-synthetic.pdf', oldBytes);
writeFileSync(output + '/canonical-meal-pdf.json', JSON.stringify({ passed: true, productionData: false, pages: pdf.pages, bytes: bytes.length, legacyPages: oldPdf.pages, frozenContentPreserved: true, foreignDenied: true, capturedAt: new Date().toISOString() }, null, 2));
console.log('PASS: canonical frozen meal PDF, multipage text, measures, notes, substitutes, alternatives, historical missing fields and caller authorization.');
