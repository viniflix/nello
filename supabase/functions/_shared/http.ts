// Request-scoped policy: never store a request's origin in a global variable.
export const PRODUCTION_ORIGINS = ['https://nellonutri.com.br', 'https://www.nellonutri.com.br'];

export function permittedOrigins(apiUrl = '') {
  const origins = new Set(PRODUCTION_ORIGINS);
  // Local origins are available only against the disposable local gateway.
  if (/^http:\/\/(127\.0\.0\.1|localhost|kong)(:\d+)?\/?$/.test(apiUrl)) {
    for (const host of ['localhost', '127.0.0.1']) {
      for (const port of [4173, 5173]) origins.add(`http://${host}:${port}`);
    }
  }
  return origins;
}

export class RequestError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export async function boundedBody(req: Request, limit: number, timeoutMs = 5000) {
  const length = req.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > limit)) throw new RequestError(413, 'request_too_large');
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestError(408, 'request_timeout')), timeoutMs);
  });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new RequestError(413, 'request_too_large');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    clearTimeout(timer!);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export const errorResponse = (status: number, error: string) => new Response(JSON.stringify({ error }), {
  status, headers: { 'Content-Type': 'application/json' },
});

export function edgeBoundary(handler: (req: Request) => Response | Promise<Response>, options: { maxBytes?: number; retired?: boolean } = {}) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const allowed = permittedOrigins(Deno.env.get('SUPABASE_URL'));
    let response: Response;
    try {
      if (origin && !allowed.has(origin)) response = errorResponse(403, 'origin_not_allowed');
      else if (req.method === 'OPTIONS') {
        const method = req.headers.get('access-control-request-method');
        const headers = req.headers.get('access-control-request-headers') || '';
        const acceptable = new Set(['authorization', 'apikey', 'content-type', 'x-client-info']);
        if ((method && method !== 'POST') || headers.split(',').some(value => value.trim() && !acceptable.has(value.trim().toLowerCase()))) {
          response = errorResponse(403, 'preflight_not_allowed');
        } else response = new Response(null, { status: 204 });
      } else if (options.retired) response = errorResponse(410, 'endpoint_retired');
      else if (req.method !== 'POST') response = errorResponse(405, 'method_not_allowed');
      else {
        const contentType = req.headers.get('content-type');
        if (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType)) throw new RequestError(415, 'unsupported_media_type');
        const body = await boundedBody(req, options.maxBytes || 65536);
        response = await handler(new Request(req.url, { method: req.method, headers: req.headers, body }));
      }
    } catch (error) {
      response = error instanceof RequestError ? errorResponse(error.status, error.code) : errorResponse(503, 'service_unavailable');
    }
    const headers = new Headers(response.headers);
    headers.delete('Access-Control-Allow-Origin');
    if (origin && allowed.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    headers.set('Vary', 'Origin');
    headers.set('Cache-Control', 'no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    if (response.status === 405) headers.set('Allow', 'POST, OPTIONS');
    if (response.status === 429 && !headers.has('Retry-After')) headers.set('Retry-After', '60');
    return new Response(response.body, { status: response.status, headers });
  };
}

export const timedFetch: typeof fetch = (input, init = {}) => fetch(input, {
  ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
});
