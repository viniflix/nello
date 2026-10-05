import { edgeBoundary, timedFetch } from '../_shared/http.ts';
import { consumeQuota } from '../_shared/quota.ts';
import { parseSentryRequest, nextSentryCursor, safeSentryIssue, safeSentryEvent } from './contracts.js';
function corsHeaders(_req: Request) { return {}; }

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

async function requireAdmin(req: Request) {
  const authorization = req.headers.get('authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!authorization || !supabaseUrl || !anonKey) return null;

  const authHeaders = { authorization, apikey: anonKey };
  const userResponse = await timedFetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders });
  if (!userResponse.ok) return null;

  const user = await userResponse.json();
  if (!user?.id) return null;

  const accessResponse = await timedFetch(`${supabaseUrl}/rest/v1/rpc/admin_access_status`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!accessResponse.ok) return null;
  const access = await accessResponse.json();
  return access?.authorized === true ? user : null;
}

Deno.serve(edgeBoundary(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') {
    return json(req, 405, { error: 'Method not allowed' });
  }

  const admin = await requireAdmin(req);
  if (!admin) {
    return json(req, 403, { error: 'Admin access required' });
  }
  await consumeQuota(admin.id, 'sentry');

  const sentryToken = Deno.env.get('SENTRY_API_TOKEN') || Deno.env.get('SENTRY_AUTH_TOKEN');
  const sentryOrg = Deno.env.get('SENTRY_ORG') || 'nello';
  const sentryProject = Deno.env.get('SENTRY_PROJECT') || 'javascript-react';

  try {
    const requestBody = await req.json().catch(() => ({}));
    let filter;
    try { filter = parseSentryRequest(requestBody); }
    catch { return json(req, 400, { error: 'invalid_sentry_filter' }); }
    const { action, issueId, hours, limit, correlation, cursor, release, environment } = filter;
    if (action === 'sources') {
      const checkedAt = new Date().toISOString();
      const check = async (provider: string, token: string | undefined, url: string, validate: (data: any) => boolean) => {
        if (!token) return { provider, state: 'not_configured', generated_at: checkedAt, data_through: null, reason: 'Credencial de leitura não configurada', usage: null };
        try {
          const response = await timedFetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!response.ok) return { provider, state: response.status === 401 || response.status === 403 ? 'authorization_required' : response.status === 429 ? 'rate_limited' : 'unavailable', generated_at: checkedAt, data_through: null, reason: `HTTP ${response.status}`, usage: null };
          const data = await response.json();
          if (!validate(data)) throw Error('invalid_source_contract');
          return { provider, state: 'available', generated_at: checkedAt, data_through: checkedAt, reason: 'Endpoint de leitura respondeu; não certifica entregas, disponibilidade global ou billing', usage: null };
        } catch { return { provider, state: 'unavailable', generated_at: checkedAt, data_through: null, reason: 'Consulta não confirmada', usage: null }; }
      };
      const sentryUrl = `https://sentry.io/api/0/projects/${encodeURIComponent(sentryOrg)}/${encodeURIComponent(sentryProject)}/`;
      const [sentry, resend] = await Promise.all([
        check('Sentry', sentryToken, sentryUrl, data => Boolean(data.id && data.slug === sentryProject)),
        check('Resend', Deno.env.get('RESEND_API_KEY'), 'https://api.resend.com/domains', data => Array.isArray(data.data)),
      ]);
      const posthogProject = Deno.env.get('POSTHOG_PROJECT_ID');
      const posthogHost = Deno.env.get('POSTHOG_API_HOST') || 'https://us.posthog.com';
      const permittedHost = ['https://us.posthog.com', 'https://eu.posthog.com'].includes(posthogHost);
      const posthog = await check('PostHog', permittedHost && /^\d+$/.test(posthogProject || '') ? Deno.env.get('POSTHOG_PERSONAL_API_KEY') : undefined,
        `${permittedHost ? posthogHost : 'https://us.posthog.com'}/api/projects/${posthogProject || '0'}/`, data => String(data.id) === posthogProject);
      return json(req, 200, { source: 'Endpoints de leitura dos provedores', generated_at: checkedAt, data_through: checkedAt,
        sources: [{ provider: 'Supabase', state: 'available', generated_at: checkedAt, data_through: checkedAt, reason: 'Auth e autorização administrativa confirmados', usage: null }, sentry, resend, posthog] });
    }
    if (!sentryToken) return json(req, 503, { error: 'sentry_not_configured' });

    if (correlation && !/^[a-zA-Z0-9-]{1,80}$/.test(correlation)) {
      return json(req, 400, { error: 'Invalid correlation ID' });
    }
    if (action === 'latest_event' && !/^\d+$/.test(issueId)) {
      return json(req, 400, { error: 'Invalid issue ID' });
    }

    if (action === 'latest_event') {
      const configuredProject = await timedFetch(`https://sentry.io/api/0/projects/${encodeURIComponent(sentryOrg)}/${encodeURIComponent(sentryProject)}/`, { headers: { Authorization: `Bearer ${sentryToken}` } });
      const requestedIssue = await timedFetch(`https://sentry.io/api/0/issues/${issueId}/`, { headers: { Authorization: `Bearer ${sentryToken}` } });
      if (!configuredProject.ok || !requestedIssue.ok) return json(req, 404, { error: 'issue_not_found' });
      const project = await configuredProject.json();
      const issue = await requestedIssue.json();
      if (String(issue.project?.id) !== String(project.id) || !project.id) return json(req, 404, { error: 'issue_not_found' });
    }

    const url = action === 'latest_event'
      ? new URL(`https://sentry.io/api/0/issues/${issueId}/events/latest/`)
      : new URL(
        `https://sentry.io/api/0/projects/${encodeURIComponent(sentryOrg)}/${encodeURIComponent(sentryProject)}/issues/`,
      );

    if (action === 'issues' || action === 'issues_page') {
      url.searchParams.set('statsPeriod', `${hours}h`);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('query', correlation ? `correlation.id:${correlation}` : 'is:unresolved');
      if (cursor) url.searchParams.set('cursor', cursor);
      if (environment !== 'all') url.searchParams.set('environment', environment);
      if (release) url.searchParams.set('query', `${url.searchParams.get('query')} release:${release}`);
    }

    const response = await timedFetch(url, {
      headers: { Authorization: `Bearer ${sentryToken}` },
    });

    if (!response.ok) {
      console.error('Sentry API request failed', { status: response.status });
      return json(req, 502, { error: 'Sentry API request failed', status: response.status });
    }

    const data = await response.json();
    if (action === 'latest_event') return json(req, 200, safeSentryEvent(data));
    if (!Array.isArray(data)) return json(req, 502, { error: 'invalid_sentry_response' });
    const safeIssues = data.map(safeSentryIssue);
    if (action === 'issues_page') return json(req, 200, {
      items: safeIssues, next_cursor: nextSentryCursor(response.headers.get('link')),
      generated_at: new Date().toISOString(), source: `Sentry · ${sentryProject}`,
      hours, environment, release: release || null, count_semantics: 'lifetime',
    });
    return json(req, 200, safeIssues);
  } catch (error) {
    console.error('Sentry proxy failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return json(req, 500, { error: 'Unable to query Sentry' });
  }
}));
