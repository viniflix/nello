import { RequestError, timedFetch } from './http.ts';

export async function activeActor(req: Request, roles?: string[]) {
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new RequestError(401, 'authentication_required');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !key) throw new RequestError(503, 'service_unavailable');
  const headers = { authorization, apikey: key };
  const userResponse = await timedFetch(`${url}/auth/v1/user`, { headers });
  if (!userResponse.ok) throw new RequestError(401, 'invalid_session');
  const user = await userResponse.json();
  if (!user?.id || !/^[0-9a-f-]{36}$/i.test(user.id)) throw new RequestError(401, 'invalid_session');
  const profileResponse = await timedFetch(`${url}/rest/v1/user_profiles?select=user_type,is_active&id=eq.${user.id}`, { headers });
  if (!profileResponse.ok) throw new RequestError(503, 'service_unavailable');
  const profiles = await profileResponse.json();
  const profile = profiles?.[0];
  if (!profile || profile.is_active === false || (roles && !roles.includes(profile.user_type))) {
    throw new RequestError(403, 'actor_not_authorized');
  }
  return { id: user.id, role: profile.user_type };
}
