import { assertIsolatedRuntime, supabaseCommand, supabaseArgs } from './isolated-runtime.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { initializeImageMagick, ImageMagick, MagickColors, MagickFormat } from '@imagemagick/magick-wasm';
import { PDFDocument } from 'pdf-lib';

assertIsolatedRuntime();
const fixture = JSON.parse(readFileSync('.backend-ci/browser-runtime/fixture.json', 'utf8'));
const status = JSON.parse(execFileSync(supabaseCommand, supabaseArgs(['status', '--workdir', '.backend-ci', '--output', 'json']), { encoding: 'utf8' }));
const api = new URL(fixture.url);
assert(api.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(api.hostname) && api.port === '54321');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(fixture.url, status.SERVICE_ROLE_KEY, options);
const actors = {};
for (const key of ['nutritionist-a', 'nutritionist-b', 'patient-a']) {
  const client = createClient(fixture.url, fixture.anonKey, options);
  const result = await client.auth.signInWithPassword({ email: fixture.personas[key].email, password: fixture.password });
  assert(!result.error, 'Synthetic actor login failed');
  actors[key] = { client, token: result.data.session.access_token, id: result.data.user.id };
}
const pro = actors['nutritionist-a'], foreign = actors['nutritionist-b'], patient = actors['patient-a'];
const sql = input => execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=postgres', 'supabase_db_nello-reconstruction', 'psql', '-X', '-t', '-A', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input, encoding: 'utf8' }).trim();
const rpc = async (client, name, params) => { const result = await client.rpc(name, params); assert(!result.error, `${name}: ${result.error?.message}`); return result.data; };
const results = [];
const passed = name => { results.push(name); console.log('PASS Storage HTTP: ' + name); };
const reserve = (actor, bucket, path, bytes, mime, recipient = null) => rpc(actor.client, 'reserve_storage_upload', { p_bucket: bucket, p_path: path, p_mime: mime, p_size: bytes.length, p_chat_recipient: recipient });
const send = (actor, reservation, bytes) => fetch(fixture.url + '/functions/v1/upload-private-file', { method: 'POST', headers: { apikey: fixture.anonKey, Authorization: 'Bearer ' + actor.token, 'Content-Type': 'application/octet-stream', 'x-upload-reservation': reservation.id }, body: bytes });
const upload = async (actor, bucket, path, bytes, mime, recipient = null) => {
  const reservation = await reserve(actor, bucket, path, bytes, mime, recipient);
  const response = await send(actor, reservation, bytes);
  const body = await response.json();
  assert.equal(response.status, 200, `Verified ${bucket}/${mime}: ${JSON.stringify(body)}`);
  assert.equal(body.status, 'confirmed'); assert.equal(body.path, path);
  const download = await admin.storage.from(bucket).download(path);
  assert(!download.error); const stored = Buffer.from(await download.data.arrayBuffer());
  assert.equal(createHash('sha256').update(stored).digest('hex'), body.sha256);
  assert.equal(stored.length, body.size);
  return { reservation, body, stored };
};

await initializeImageMagick(readFileSync('node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm'));
const image = ImageMagick.read(MagickColors.Red, 20, 10, data => {
  data.comment = 'SYNTHETIC_PRIVATE_METADATA';
  return data.write(MagickFormat.Png, bytes => Buffer.from(bytes));
});
const avatarPath = pro.id + '/' + randomUUID() + '.png';
const avatar = await upload(pro, 'avatars', avatarPath, image, 'image/png');
ImageMagick.read(avatar.stored, data => assert.equal(data.comment, null));
const bind = await pro.client.from('user_profiles').update({ avatar_url: 'storage:avatars/' + avatarPath }).eq('id', pro.id);
assert(!bind.error, 'Verified avatar binding failed');
assert((await foreign.client.storage.from('avatars').download(avatarPath)).error);
assert((await pro.client.storage.from('avatars').upload(pro.id + '/' + randomUUID() + '.png', image, { contentType: 'image/png' })).error);
assert((await fetch(fixture.url + '/storage/v1/object/public/avatars/' + avatarPath)).status !== 200);
passed('private avatar, metadata removal, hash, binding and cross-clinic denial');
const replay = await send(pro, avatar.reservation, image);
assert.equal(replay.status, 200); assert.equal((await replay.json()).sha256, avatar.body.sha256);
assert.equal((await send(foreign, avatar.reservation, image)).status, 403);
passed('idempotent confirmed retry and foreign reservation denial');
const concurrentPath = pro.id + '/' + randomUUID() + '.png';
const concurrentReservation = await reserve(pro, 'avatars', concurrentPath, image, 'image/png');
const concurrent = await Promise.all([send(pro, concurrentReservation, image), send(pro, concurrentReservation, image)]);
assert(concurrent.some(response => response.status === 200));
assert(concurrent.every(response => [200, 409].includes(response.status)));
assert.equal(sql(`select count(*) from storage.objects where bucket_id='avatars' and name='${concurrentPath}';`), '1');
passed('simultaneous Edge requests publish one immutable object');

const malformed = Buffer.from('not a PNG');
const badPath = pro.id + '/' + randomUUID() + '.png';
const bad = await reserve(pro, 'avatars', badPath, malformed, 'image/png');
assert.equal((await send(pro, bad, malformed)).status, 422);
assert((await admin.storage.from('avatars').download(badPath)).error);
const denied = await pro.client.rpc('reserve_storage_upload', { p_bucket: 'chat_media', p_path: pro.id + '/' + randomUUID() + '.mp4', p_mime: 'video/mp4', p_size: 20971521, p_chat_recipient: patient.id });
assert(denied.error);
passed('fake MIME never publishes bytes and chat rejects oversized reservation');

const pdf = await PDFDocument.create(); pdf.addPage([100, 100]);
const pdfBytes = Buffer.from(await pdf.save());
await upload(pro, 'financial-docs', pro.id + '/' + randomUUID() + '.pdf', pdfBytes, 'application/pdf');
await upload(pro, 'lab-results-pdfs', patient.id + '/' + randomUUID() + '.pdf', pdfBytes, 'application/pdf');
passed('financial and laboratory PDFs parsed and hash-confirmed');
const episode = sql(`select id from public.care_episodes where patient_id='${patient.id}' and status='active';`);
assert.match(episode, /^[a-f0-9-]{36}$/);
const photoPath = patient.id + '/' + episode + '/progress_photos/' + randomUUID() + '.png';
await upload(patient, 'patient-photos', photoPath, image, 'image/png');
const photo = await patient.client.from('progress_photos').insert({ patient_id: patient.id, care_episode_id: episode, photo_url: photoPath, storage_path: photoPath, photo_date: '2026-10-01', uploaded_by: patient.id }).select('id').single();
assert(!photo.error, 'Progress photo binding failed');
assert(!(await pro.client.storage.from('patient-photos').download(photoPath)).error);
assert((await foreign.client.storage.from('patient-photos').download(photoPath)).error);
await rpc(patient.client, 'invalidate_progress_photo', { p_photo_id: photo.data.id, p_reason: 'Synthetic revocation test' });
assert((await patient.client.storage.from('patient-photos').download(photoPath)).error);
passed('patient photo episode binding, professional access and invalidation revocation');

const clinicalIntent = await rpc(pro.client, 'create_clinical_attachment_upload_intent', {
  p_patient_id: patient.id, p_care_episode_id: episode, p_clinical_record_id: null,
  p_category_code: 'laboratory_exam', p_description: 'Synthetic verified PDF', p_clinical_date: '2026-10-01',
  p_original_filename: 'synthetic.pdf', p_mime_type: 'application/pdf', p_size_bytes: pdfBytes.length,
});
const clinical = await upload(pro, 'clinical-attachments', clinicalIntent.storage_path, pdfBytes, 'application/pdf');
const confirmedClinical = await rpc(pro.client, 'confirm_clinical_attachment_upload', {
  p_attachment_id: clinicalIntent.attachment_id, p_sha256: clinical.body.sha256, p_size_bytes: clinical.body.size, p_mime_type: 'application/pdf',
});
assert.equal(confirmedClinical.status, 'active');
assert((await foreign.client.storage.from('clinical-attachments').download(clinicalIntent.storage_path)).error);
passed('clinical PDF trusted ledger confirmation and foreign read denial');
let identity = await rpc(pro.client, 'get_my_document_identity', {});
if (!identity.version) {
  await rpc(pro.client, 'save_my_document_identity', { p_payload: { professional_name: 'Synthetic QA Professional' }, p_expected_version: 0, p_reason: 'Synthetic asset fixture' });
  identity = await rpc(pro.client, 'get_my_document_identity', {});
}
const assetIntent = await rpc(pro.client, 'create_document_asset_upload_intent', {
  p_asset_type: 'logo', p_original_filename: 'synthetic.png', p_mime_type: 'image/png', p_size_bytes: image.length,
  p_expected_identity_version: identity.version,
});
const asset = await upload(pro, 'document-assets', assetIntent.storage_path, image, 'image/png');
assert(asset.body.size !== image.length, 'Metadata stripping should change stored bytes');
const documentConfirmation = await pro.client.functions.invoke('confirm-document-asset', { body: { uploadId: assetIntent.upload_id } });
assert(!documentConfirmation.error, 'Server-owned document asset confirmation failed');
passed('document logo accepts sanitized size and trusted worker hash');

const token = randomUUID(), anamnesisId = randomUUID();
sql(`insert into public.anamnesis_records(id,patient_id,nutritionist_id,care_episode_id,content,status,template_snapshot,public_access_token,token_expires_at,filled_by)
 values('${anamnesisId}','${patient.id}','${pro.id}','${episode}','{}','in_progress','{"sections":[{"fields":[{"id":"file","type":"file"}]}]}','${token}',now()+interval '1 hour','patient');`);
const anonymous = createClient(fixture.url, fixture.anonKey, options);
const anamnesisPath = 'public/' + token + '/' + anamnesisId + '/' + randomUUID() + '.pdf';
const anonymousReservation = await rpc(anonymous, 'reserve_storage_upload', { p_bucket: 'anamnesis-attachments', p_path: anamnesisPath, p_mime: 'application/pdf', p_size: pdfBytes.length, p_public_token: token });
const anonymousUpload = await fetch(fixture.url + '/functions/v1/upload-private-file', { method: 'POST', headers: { apikey: fixture.anonKey, Authorization: 'Bearer ' + fixture.anonKey, 'Content-Type': 'application/octet-stream', 'x-upload-reservation': anonymousReservation.id, 'x-anamnesis-token': token }, body: pdfBytes });
assert.equal(anonymousUpload.status, 200);
const attachments = await rpc(anonymous, 'attach_anamnesis_file', { p_record_id: anamnesisId, p_token: token, p_path: anamnesisPath, p_field_id: 'file', p_field_label: 'Arquivo', p_file_name: 'synthetic.pdf' });
assert(!(await anonymous.storage.from('anamnesis-attachments').createSignedUrl(anamnesisPath, 2)).error);
await rpc(anonymous, 'detach_anamnesis_file', { p_record_id: anamnesisId, p_token: token, p_attachment_id: attachments[0].id });
assert((await anonymous.storage.from('anamnesis-attachments').createSignedUrl(anamnesisPath, 30)).error);
passed('anonymous anamnesis capability uploads, binds and revokes on detach');

const signed = await pro.client.storage.from('avatars').createSignedUrl(avatarPath, 2);
assert(!signed.error);
assert.equal((await fetch(signed.data.signedUrl)).status, 200);
await new Promise(resolve => setTimeout(resolve, 3100));
assert.notEqual((await fetch(signed.data.signedUrl)).status, 200);
passed('copied signed URL works only during its bounded validity');

for (const [file, mime, extension] of [['audio.mp3', 'audio/mpeg', 'mp3'], ['audio.ogg', 'audio/ogg', 'ogg'], ['audio.m4a', 'audio/mp4', 'm4a'], ['recorder-audio.webm', 'audio/webm', 'webm'], ['video.mp4', 'video/mp4', 'mp4'], ['video.mov', 'video/quicktime', 'mov'], ['video.webm', 'video/webm', 'webm']]) {
  const bytes = readFileSync('src/__tests__/fixtures/storage/synthetic-' + file);
  await upload(pro, 'chat_media', pro.id + '/' + randomUUID() + '.' + extension, bytes, mime, patient.id);
  passed('actual Edge media parser: ' + mime);
}
const orphanPath = pro.id + '/' + randomUUID() + '.png';
const orphan = await upload(pro, 'avatars', orphanPath, image, 'image/png');
await rpc(pro.client, 'abandon_storage_upload', { p_bucket: 'avatars', p_path: orphanPath });
const maintenance = await fetch(fixture.url + '/functions/v1/storage-maintenance', { method: 'POST', headers: { apikey: fixture.anonKey, Authorization: 'Bearer ' + status.SERVICE_ROLE_KEY, 'Content-Type': 'application/json' }, body: '{}' });
assert.equal(maintenance.status, 200); const counts = await maintenance.json(); assert(counts.orphans.removed >= 1);
assert((await admin.storage.from('avatars').download(orphanPath)).error);
assert(!(await admin.storage.from('avatars').download(avatarPath)).error);
assert.equal(sql(`select status from private.storage_upload_reservations where id='${orphan.reservation.id}';`), 'deleted');
passed('Storage API orphan removal preserves bound files');

// Isolated trusted ledger fixtures exercise the daily quota boundaries without
// transferring hundreds of MiB. Actual validation/storage is tested above.
sql(`update private.storage_upload_reservations set created_at=now()-interval '25 hours' where quota_key='${pro.id}';`);
const quotaFixtures = (count, size, quotaKey) => sql(`insert into private.storage_upload_reservations(bucket_id,object_path,actor_id,tenant_id,quota_key,mime_type,expected_size,status,failure_code)
 select 'avatars','${pro.id}/'||gen_random_uuid()::text||'.png','${pro.id}','${pro.id}',${quotaKey},'image/png',${size},'failed','quota_fixture' from generate_series(1,${count});`);
const quotaDenial = async expected => {
  const result = await pro.client.rpc('reserve_storage_upload', { p_bucket: 'avatars', p_path: pro.id + '/' + randomUUID() + '.png', p_mime: 'image/png', p_size: 1 });
  assert.equal(result.error?.message, expected);
};
try {
  quotaFixtures(80, 1, `'${pro.id}'`); await quotaDenial('actor_upload_quota_exceeded');
  sql("delete from private.storage_upload_reservations where failure_code='quota_fixture';");
  quotaFixtures(40, 5242880, `'${pro.id}'`); await quotaDenial('actor_upload_quota_exceeded');
  sql("delete from private.storage_upload_reservations where failure_code='quota_fixture';");
  quotaFixtures(500, 1, "'synthetic-other-quota-'||gen_random_uuid()::text"); await quotaDenial('tenant_upload_quota_exceeded');
} finally { sql("delete from private.storage_upload_reservations where failure_code='quota_fixture';"); }
passed('real RPC daily actor count, actor byte and aggregate tenant quotas');
mkdirSync('.backend-ci/storage-results', { recursive: true });
writeFileSync('.backend-ci/storage-results/result.json', JSON.stringify({ passed: true, productionData: false, tests: results, capturedAt: new Date().toISOString() }, null, 2));
