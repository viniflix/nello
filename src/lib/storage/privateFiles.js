import { supabase } from '@/infrastructure/supabase/client';

export const PRIVATE_FILE_TTL_SECONDS = 300;
const BUCKETS = new Set(['avatars', 'financial-docs', 'chat_media', 'lab-results-pdfs',
  'patient-photos', 'clinical-attachments', 'document-assets', 'anamnesis-attachments']);

// Persist an object identity, never an expiring access token. Legacy URLs are
// accepted only from this project's Storage origin.
export function parsePrivateFile(value, expectedBucket = null, apiUrl = supabase.supabaseUrl) {
  if (typeof value !== 'string' || !value || value.length > 2048) return null;
  let bucket = expectedBucket;
  let path = value;
  if (value.startsWith('storage:')) {
    const separator = value.indexOf('/', 8);
    if (separator < 0) return null;
    bucket = value.slice(8, separator);
    path = value.slice(separator + 1);
  } else if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.origin !== new URL(apiUrl).origin || url.username || url.password || url.hash) return null;
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
      if (!match) return null;
      bucket = match[1] === 'chat-media' ? 'chat_media' : match[1];
      path = decodeURIComponent(match[2]);
    } catch { return null; }
  } else {
    const prefix = value.slice(0, value.indexOf('/'));
    if (BUCKETS.has(prefix)) { bucket = prefix; path = value.slice(prefix.length + 1); }
  }
  if (!BUCKETS.has(bucket) || (expectedBucket && expectedBucket !== bucket)) return null;
  // Reject nested encodings as well as path traversal. Storage keys created by
  // the app do not contain URL escapes, query strings or empty segments.
  if (!path || /[%?#\\]/.test(path) || [...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      || path.split('/').some(segment => !segment || segment === '.' || segment === '..')) return null;
  return { bucket, path };
}

export function privateFileReference(bucket, path) {
  const parsed = parsePrivateFile(path, bucket);
  if (!parsed) throw new Error('invalid_private_file_reference');
  return `storage:${parsed.bucket}/${parsed.path}`;
}

export async function signPrivateFile(value, expectedBucket, expiresIn = PRIVATE_FILE_TTL_SECONDS) {
  const parsed = parsePrivateFile(value, expectedBucket);
  if (!parsed) throw new Error('invalid_private_file_reference');
  const before = await supabase.auth.getSession();
  const session = before.data?.session;
  if (before.error || !session?.user?.id || !session.access_token) throw new Error('authentication_required');
  const ttl = Math.min(PRIVATE_FILE_TTL_SECONDS, Math.max(1, Math.floor(Number(expiresIn) || PRIVATE_FILE_TTL_SECONDS)));
  const { data, error } = await supabase.storage.from(parsed.bucket).createSignedUrl(parsed.path, ttl);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error('private_file_access_unavailable');
  const after = await supabase.auth.getSession();
  if (after.error || after.data?.session?.user?.id !== session.user.id
      || after.data?.session?.access_token !== session.access_token) {
    throw new Error('private_file_session_changed');
  }
  // Do not trust an unexpected origin returned by a proxy/configuration error.
  if (new URL(data.signedUrl).origin !== new URL(supabase.supabaseUrl).origin) {
    throw new Error('private_file_origin_mismatch');
  }
  return data.signedUrl;
}
