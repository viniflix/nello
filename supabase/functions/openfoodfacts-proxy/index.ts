import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateFoodRequest } from './validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const offHeaders = { 'User-Agent': 'Nello/1.0 (food lookup; https://nellonutri.com.br)' };
const resultCache = new Map<string, { expires: number; value: unknown }>();
let fatSecretToken: { value: string; expires: number } | null = null;

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}

async function externalJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('upstream_unavailable');
  return response.json();
}

async function getFatSecretToken() {
  if (fatSecretToken && fatSecretToken.expires > Date.now()) return fatSecretToken.value;
  const id = Deno.env.get('FATSECRET_CLIENT_ID');
  const secret = Deno.env.get('FATSECRET_CLIENT_SECRET');
  if (!id || !secret) return null;
  try {
    const data = await externalJson('https://oauth.fatsecret.com/connect/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=basic',
    });
    if (typeof data.access_token !== 'string') return null;
    fatSecretToken = {
      value: data.access_token,
      expires: Date.now() + Math.max(0, (Number(data.expires_in) || 3600) - 60) * 1000,
    };
    return fatSecretToken.value;
  } catch {
    return null;
  }
}

function cached(key: string) {
  const entry = resultCache.get(key);
  if (!entry || entry.expires <= Date.now()) {
    resultCache.delete(key);
    return null;
  }
  return entry.value;
}

function remember(key: string, value: unknown) {
  if (resultCache.size >= 200) resultCache.delete(resultCache.keys().next().value!);
  resultCache.set(key, { expires: Date.now() + 60_000, value });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authorization = req.headers.get('Authorization') || '';
  const token = /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1];
  if (!token) return json(401, { error: 'unauthorized' });
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(503, { error: 'service_unavailable' });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json(401, { error: 'unauthorized' });

  if (Number(req.headers.get('content-length')) > 2048) return json(413, { error: 'request_too_large' });
  let payload;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json(413, { error: 'request_too_large' });
    payload = validateFoodRequest(JSON.parse(raw));
  } catch {
    return json(400, { error: 'invalid_request' });
  }
  if (!payload) return json(400, { error: 'invalid_request' });

  const { data: allowed, error: quotaError } = await admin.rpc('claim_food_proxy_quota', { p_user_id: user.id });
  if (quotaError) return json(503, { error: 'service_unavailable' });
  if (!allowed) return json(429, { error: 'rate_limited' }, { 'Retry-After': '60' });

  const key = payload.action === 'search' ? `search:${payload.query.toLowerCase()}` : `product:${payload.productCode}`;
  const hit = cached(key);
  if (hit) return json(200, hit);

  try {
    if (payload.action === 'search') {
      const fsToken = await getFatSecretToken();
      let fsResults: unknown[] = [];
      if (fsToken) {
        try {
          const data = await externalJson(`https://platform.fatsecret.com/rest/server.api?method=foods.search.v3&search_expression=${encodeURIComponent(payload.query)}&format=json`, {
            headers: { Authorization: `Bearer ${fsToken}` },
          });
          const raw = data.foods_search?.results?.food;
          fsResults = (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 24).map((food: Record<string, string>) => ({
            source: 'fatsecret', id: `fs_${food.food_id}`, name: food.food_name,
            brand: food.brand_name || 'Desconhecida', image: null,
          }));
        } catch { /* Continue with Open Food Facts. */ }
      }

      let offResults: unknown[] = [];
      const endpoints = [
        `https://br.openfoodfacts.org/api/v2/search?q=${encodeURIComponent(payload.query)}&fields=code,product_name,product_name_pt,product_name_en,brands,image_url&page_size=24&lc=pt`,
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(payload.query)}&json=1&page_size=24&fields=product_name,product_name_pt,brands,code,image_url`,
      ];
      for (const url of endpoints) {
        try {
          const data = await externalJson(url, { headers: offHeaders });
          offResults = (Array.isArray(data.products) ? data.products : []).slice(0, 24).map((product: Record<string, string>) => ({
            source: 'openfoodfacts', id: product.code,
            name: product.product_name_pt || product.product_name || product.product_name_en || 'Produto sem nome',
            brand: product.brands || 'Desconhecida', image: product.image_url,
          }));
          if (offResults.length) break;
        } catch { /* Try the fallback endpoint. */ }
      }
      const result = { results: [...fsResults, ...offResults], total: fsResults.length + offResults.length,
        timestamp: new Date().toISOString() };
      remember(key, result);
      return json(200, result);
    }

    const code = payload.productCode;
    let result;
    if (code.startsWith('fs_')) {
      const fsToken = await getFatSecretToken();
      if (!fsToken) return json(503, { error: 'upstream_unavailable' });
      const data = await externalJson(`https://platform.fatsecret.com/rest/server.api?method=food.get.v4&food_id=${encodeURIComponent(code.slice(3))}&format=json`, {
        headers: { Authorization: `Bearer ${fsToken}` },
      });
      result = { source: 'fatsecret', data: data.food || null };
    } else {
      const data = await externalJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, { headers: offHeaders });
      result = { source: 'openfoodfacts', data: data.product || null };
    }
    remember(key, result);
    return json(200, result);
  } catch {
    return json(502, { error: 'upstream_unavailable' });
  }
});
