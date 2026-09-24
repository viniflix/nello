import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyDocumentAssetBytes } from './assetValidation.ts';

const ALLOWED_ORIGINS = new Set([
  'https://nellonutri.com.br',
  'https://www.nellonutri.com.br',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);

function headersFor(req: Request): HeadersInit {
  const origin = req.headers.get('origin');
  return {
    ...(origin && ALLOWED_ORIGINS.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
}

function response(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(req) });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response(req, 403, { error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return response(req, 200, { ok: true });
  if (req.method !== 'POST') return response(req, 405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authHeader?.startsWith('Bearer ') || !url || !anonKey || !serviceKey) {
    return response(req, 401, { error: 'authentication_required' });
  }

  let uploadId: string;
  try {
    const body = await req.json();
    uploadId = body?.uploadId;
  } catch {
    return response(req, 400, { error: 'invalid_request' });
  }
  if (typeof uploadId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadId)) {
    return response(req, 400, { error: 'invalid_upload_id' });
  }

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(authHeader.slice(7));
  if (authError || !authData?.user) return response(req, 401, { error: 'invalid_session' });
  const actorId = authData.user.id;

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: upload, error: uploadError } = await admin
    .from('document_asset_uploads')
    .select('id,professional_id,status,expires_at,storage_bucket,storage_path,mime_type,size_bytes')
    .eq('id', uploadId)
    .maybeSingle();
  if (uploadError) return response(req, 503, { error: 'upload_lookup_failed' });
  if (!upload || upload.professional_id !== actorId) return response(req, 404, { error: 'upload_not_found' });
  if (upload.status !== 'uploading' || Date.parse(upload.expires_at) <= Date.now()) {
    return response(req, 409, { error: 'upload_not_pending' });
  }
  if (upload.storage_bucket !== 'document-assets' || Number(upload.size_bytes) < 1 || Number(upload.size_bytes) > 5 * 1024 * 1024) {
    return response(req, 400, { error: 'invalid_upload_reservation' });
  }

  const { data: file, error: downloadError } = await admin.storage.from('document-assets').download(upload.storage_path);
  if (downloadError || !file) return response(req, 404, { error: 'uploaded_asset_not_found' });

  let verified;
  try {
    verified = await verifyDocumentAssetBytes(new Uint8Array(await file.arrayBuffer()), upload.mime_type, Number(upload.size_bytes));
  } catch {
    return response(req, 422, { error: 'uploaded_asset_content_invalid' });
  }

  const { data, error } = await admin.rpc('confirm_document_asset_upload_verified', {
    p_upload_id: uploadId,
    p_actor_id: actorId,
    p_sha256: verified.sha256,
    p_size_bytes: verified.sizeBytes,
    p_mime_type: verified.mimeType,
  });
  if (error) return response(req, 409, { error: error.message || 'asset_confirmation_failed' });
  return response(req, 200, data);
});
