// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boundedBody, edgeBoundary, permittedOrigins } from '../../supabase/functions/_shared/http.ts';
import { activeActor } from '../../supabase/functions/_shared/actor.ts';

const url = 'https://gateway.example/functions/v1/test';
const request = (origin?: string, options: RequestInit = {}) => new Request(url, {
  method: 'POST', body: '{}', ...options,
  headers: { ...(origin ? { origin } : {}), 'content-type': 'application/json', ...options.headers },
});
afterEach(() => vi.unstubAllGlobals());
function environment(value = 'https://production.supabase.co') {
  vi.stubGlobal('Deno', { env: { get: (name: string) => name === 'SUPABASE_URL' ? value : 'public-key' } });
}

describe('Edge HTTP boundary', () => {
  it.each(['https://evil.example', 'null', 'https://nellonutri.com.br.evil.example', 'http://localhost:4173'])('denies %s before invoking business code', async origin => {
    environment(); const handler = vi.fn(() => new Response('private'));
    const response = await edgeBoundary(handler)(request(origin));
    expect(response.status).toBe(403); expect(handler).not.toHaveBeenCalled();
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });
  it('keeps CORS scoped to each request under concurrency', async () => {
    environment();
    const handler = edgeBoundary(async () => new Response('{}', { headers: { 'Access-Control-Allow-Origin': '*' } }));
    const origins = ['https://nellonutri.com.br', 'https://www.nellonutri.com.br'];
    const responses = await Promise.all(origins.map(origin => handler(request(origin))));
    responses.forEach((response, i) => {
      expect(response.headers.get('access-control-allow-origin')).toBe(origins[i]);
      expect(response.headers.get('vary')).toBe('Origin');
      expect(response.headers.get('cache-control')).toBe('no-store');
    });
  });
  it('permits loopback only with a local gateway', () => {
    expect(permittedOrigins('http://kong:8000').has('http://127.0.0.1:4173')).toBe(true);
    expect(permittedOrigins('https://kong.attacker.example').has('http://127.0.0.1:4173')).toBe(false);
  });
  it.each([
    { 'access-control-request-method': 'DELETE' },
    { 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-forged' },
  ])('rejects unsupported preflight: %j', async headers => {
    environment();
    const result = await edgeBoundary(() => new Response())(request('https://nellonutri.com.br', { method: 'OPTIONS', body: undefined, headers }));
    expect(result.status).toBe(403);
  });
  it('accepts the real Supabase preflight without invoking business code', async () => {
    environment(); const handler = vi.fn();
    const result = await edgeBoundary(handler)(request('https://nellonutri.com.br', { method: 'OPTIONS', body: undefined,
      headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,apikey,content-type,x-client-info' } }));
    expect(result.status).toBe(204); expect(handler).not.toHaveBeenCalled();
  });
  it.each([
    { body: 'abcde' },
    { body: '{}', headers: { 'content-length': '999' } },
    { body: 'ééé' },
  ])('caps bytes even without an honest Content-Length: %j', async options => {
    environment(); const handler = vi.fn();
    expect((await edgeBoundary(handler, { maxBytes: 4 })(request(undefined, options))).status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });
  it('rejects a slow streaming body and cancels its reader', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); }, cancel });
    const req = new Request(url, { method: 'POST', body, duplex: 'half' } as RequestInit);
    await expect(boundedBody(req, 4, 5)).rejects.toMatchObject({ status: 408 });
    expect(cancel).toHaveBeenCalled();
  });
  it('removes internal exception details and private body from errors', async () => {
    environment();
    const response = await edgeBoundary(() => { throw Error('PRIVATE_TOKEN_PATIENT'); })(request());
    expect(response.status).toBe(503); expect(await response.text()).not.toContain('PRIVATE_TOKEN');
  });
});

describe('explicit Edge actor authorization', () => {
  it.each([401, 403])('denies invalid or expired Auth responses %s', async status => {
    environment(); vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
    await expect(activeActor(request(undefined, { headers: { authorization: 'Bearer expired' } }))).rejects.toMatchObject({ status: 401 });
  });
  it.each([{ user_type: 'nutritionist', is_active: false }, { user_type: 'patient', is_active: true }])('denies the wrong actor: %j', async profile => {
    environment();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ id: '11111111-1111-4111-8111-111111111111' })).mockResolvedValueOnce(Response.json([profile])));
    await expect(activeActor(request(undefined, { headers: { authorization: 'Bearer session' } }), ['nutritionist'])).rejects.toMatchObject({ status: 403 });
  });
  it('does not accept an anonymous API key as user identity', async () => {
    environment(); vi.stubGlobal('fetch', vi.fn());
    await expect(activeActor(request())).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
