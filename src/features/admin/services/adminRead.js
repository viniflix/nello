import {readRequest} from '@/lib/supabase/readRequest';
import {executeRead,readPolicies} from '@/lib/utils/readPolicy';
import { supabase } from '@/infrastructure/supabase/client';

// Only reads use these adapters. Mutation payloads/nonces and retry ownership
// remain with their existing services.
export function adminReadRpc(name, args, { signal } = {}) {
  return readRequest(() => args === undefined ? supabase.rpc(name) : supabase.rpc(name, args), {signal,policy:readPolicies.admin});
}
export function adminReadInvoke(name, options, { signal } = {}) {
  const action = options?.body?.action;
  const pure = name === 'sentry-proxy' && ['releases','continuity','sources','product_analytics'].includes(action)
    || name === 'admin-support' && ['status','attachment'].includes(action);
  if (!pure) return supabase.functions.invoke(name, { ...options, ...(signal ? { signal } : {}) });
  // send/sync and unknown actions retain their durable protocol, with no retry.
  return executeRead(budget => supabase.functions.invoke(name, { ...options, signal:budget }), {signal,policy:readPolicies.edge});
}
