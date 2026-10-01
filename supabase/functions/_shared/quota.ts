import { RequestError, timedFetch } from './http.ts';

export async function consumeQuota(actor: string, operation: 'pdf' | 'sentry' | 'document') {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new RequestError(503, 'service_unavailable');
  const response = await timedFetch(`${url}/rest/v1/rpc/consume_edge_operation_quota`, {
    method: 'POST', headers: { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ p_actor: actor, p_operation: operation }),
  });
  if (!response.ok) throw new RequestError(503, 'service_unavailable');
  if (await response.json() !== true) throw new RequestError(429, 'rate_limited');
}
