const DEFAULT_ALLOWED_ORIGINS = [
  'https://nellonutri.com.br',
  'https://www.nellonutri.com.br',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://localhost:5173',
];

function allowedOrigins() {
  const configured = (Deno.env.get('OBSERVABILITY_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };

  if (origin && allowedOrigins().has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

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
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: authHeaders });
  if (!userResponse.ok) return null;

  const user = await userResponse.json();
  if (!user?.id) return null;

  const accessResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_access_status`, {
    method: 'POST',
    headers: { ...authHeaders, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!accessResponse.ok) return null;
  const access = await accessResponse.json();
  return access?.authorized === true ? user : null;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  if (origin && !allowedOrigins().has(origin)) {
    return json(req, 403, { error: 'Origin not allowed' });
  }

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

  const sentryToken = Deno.env.get('SENTRY_API_TOKEN') || Deno.env.get('SENTRY_AUTH_TOKEN');
  const sentryOrg = Deno.env.get('SENTRY_ORG') || 'nello';
  const sentryProject = Deno.env.get('SENTRY_PROJECT') || 'javascript-react';

  if (!sentryToken) {
    return json(req, 503, { error: 'Sentry integration is not configured' });
  }

  try {
    const requestBody = await req.json().catch(() => ({}));
    const action = requestBody?.action === 'latest_event' ? 'latest_event' : 'issues';
    const issueId = String(requestBody?.issue_id || '');
    const hours = Math.min(336, Math.max(1, Number(requestBody?.hours) || 24));
    const limit = Math.min(100, Math.max(1, Number(requestBody?.limit) || 25));
    const correlation = String(requestBody?.correlation_id || '');

    if (correlation && !/^[a-zA-Z0-9-]{1,80}$/.test(correlation)) {
      return json(req, 400, { error: 'Invalid correlation ID' });
    }
    if (action === 'latest_event' && !/^\d+$/.test(issueId)) {
      return json(req, 400, { error: 'Invalid issue ID' });
    }

    const url = action === 'latest_event'
      ? new URL(`https://sentry.io/api/0/issues/${issueId}/events/latest/`)
      : new URL(
        `https://sentry.io/api/0/projects/${encodeURIComponent(sentryOrg)}/${encodeURIComponent(sentryProject)}/issues/`,
      );

    if (action === 'issues') {
      url.searchParams.set('statsPeriod', hours <= 24 ? '24h' : '14d');
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('query', correlation ? `correlation.id:${correlation}` : 'is:unresolved');
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${sentryToken}` },
    });

    if (!response.ok) {
      console.error('Sentry API request failed', { status: response.status });
      return json(req, 502, { error: 'Sentry API request failed', status: response.status });
    }

    const data = await response.json();

    if (action === 'latest_event') {
      const exceptionEntry = data.entries?.find((entry: any) => entry.type === 'exception');
      const exceptions = (exceptionEntry?.data?.values || []).map((exception: any) => ({
        type: exception.type,
        value: exception.value,
        frames: (exception.stacktrace?.frames || []).map((frame: any) => ({
          filename: frame.filename,
          function: frame.function,
          line: frame.lineNo,
          column: frame.colNo,
          in_app: frame.inApp,
        })),
      }));
      const allowedTags = new Set([
        'browser',
        'correlation.id',
        'environment',
        'error.code',
        'error.module',
        'error.source',
        'http.status_code',
        'level',
        'release',
        'transaction',
      ]);

      return json(req, 200, {
        event_id: data.eventID,
        issue_id: data.groupID,
        date_created: data.dateCreated,
        title: data.title,
        location: data.location,
        browser: data.contexts?.browser
          ? { name: data.contexts.browser.name, version: data.contexts.browser.version }
          : null,
        os: data.contexts?.os
          ? { name: data.contexts.os.name, version: data.contexts.os.version }
          : null,
        exceptions,
        tags: (data.tags || []).filter((tag: { key: string }) => allowedTags.has(tag.key)),
      });
    }

    const issues = data.map((issue: Record<string, unknown>) => ({
      id: issue.id,
      shortId: issue.shortId,
      title: issue.title,
      culprit: issue.culprit,
      firstSeen: issue.firstSeen,
      lastSeen: issue.lastSeen,
      count: issue.count,
      userCount: issue.userCount,
      level: issue.level,
      status: issue.status,
      permalink: issue.permalink,
      type: issue.type,
    }));

    return json(req, 200, issues);
  } catch (error) {
    console.error('Sentry proxy failed', {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return json(req, 500, { error: 'Unable to query Sentry' });
  }
});
