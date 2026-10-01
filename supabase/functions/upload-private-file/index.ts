import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { edgeBoundary, RequestError, timedFetch } from '../_shared/http.ts';
import { initializeImageSanitizer } from './imageSanitizer.ts';
import { processPrivateUpload, type UploadContext } from './handler.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let imageInitialization: Promise<void> | undefined;
const initializeImages = () => imageInitialization ??= Deno.readFile(
  new URL('./.generated/magick.wasm', import.meta.url),
).then(initializeImageSanitizer);

async function authorizeUpload(req: Request): Promise<UploadContext> {
  const id = req.headers.get('x-upload-reservation');
  const publicToken = req.headers.get('x-anamnesis-token');
  if (!id || !UUID.test(id) || publicToken && !UUID.test(publicToken)) throw new RequestError(400, 'invalid_upload_request');
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) throw new RequestError(503, 'upload_service_unavailable');
  const auth = req.headers.get('authorization');
  if (!publicToken && (!auth?.startsWith('Bearer ') || auth.slice(7) === anon)) throw new RequestError(401, 'authentication_required');
  const caller = createClient(url, anon, { auth: { persistSession: false }, global: { fetch: timedFetch, headers: auth ? { Authorization: auth } : {} } });
  if (auth && auth.slice(7) !== anon) {
    const { data, error } = await caller.auth.getUser(auth.slice(7));
    if (error || !data?.user) throw new RequestError(401, 'invalid_session');
  }
  const { data, error } = await caller.rpc('claim_storage_upload', { p_reservation_id: id, p_public_token: publicToken || null });
  if (error || !data) throw new RequestError(error?.code === 'P0001' ? 409 : 403, 'upload_not_available');
  return { reservation: data, initializeImages,
    mediaWasmPath: new URL('./.generated/MediaInfoModule.wasm', import.meta.url).pathname,
    admin: createClient(url, service, { auth: { persistSession: false }, global: { fetch: timedFetch } }) };
}

Deno.serve(edgeBoundary(processPrivateUpload, {
  binary: true, maxBytes: 20 * 1024 * 1024, bodyTimeoutMs: 30_000,
  allowedHeaders: ['x-upload-reservation', 'x-anamnesis-token'], beforeBody: authorizeUpload,
}));
