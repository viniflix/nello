import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE = resolve(process.cwd(), '.codex-local', 'observability.env');

function loadLocalEnv(path = ENV_FILE) {
  if (!existsSync(path)) return {};

  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
        return [key, value];
      }),
  );
}

const localEnv = loadLocalEnv();
const env = { ...localEnv, ...process.env };
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith('--')) || 'all';

function option(name, fallback) {
  const prefix = `--${name}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

const hours = boundedInteger(option('hours', '24'), 24, 1, 336);
const limit = boundedInteger(option('limit', '25'), 25, 1, 100);
const correlation = option('correlation', '');
const issueId = option('issue', '');

if (correlation && !/^[a-zA-Z0-9-]{1,80}$/.test(correlation)) {
  throw new Error('Invalid --correlation value.');
}
if (issueId && !/^\d+$/.test(issueId)) throw new Error('Invalid --issue value.');

function required(keys) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')} in ${ENV_FILE}`);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: 'Non-JSON response', status: response.status };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function querySentry() {
  if (!env.SENTRY_READ_TOKEN) return querySentryViaSupabase();
  required(['SENTRY_ORG', 'SENTRY_PROJECT']);
  const base = (env.SENTRY_API_HOST || 'https://sentry.io').replace(/\/$/, '');
  const url = issueId
    ? new URL(`${base}/api/0/issues/${issueId}/events/latest/`)
    : new URL(`${base}/api/0/projects/${encodeURIComponent(env.SENTRY_ORG)}/${encodeURIComponent(env.SENTRY_PROJECT)}/issues/`);
  if (!issueId) {
    url.searchParams.set('statsPeriod', hours <= 24 ? '24h' : '14d');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('query', correlation ? `correlation.id:${correlation}` : 'is:unresolved');
  }

  const issues = await requestJson(url, {
    headers: { Authorization: `Bearer ${env.SENTRY_READ_TOKEN}` },
  });

  if (issueId) return issues;
  return issues.map((issue) => ({
    id: issue.id,
    short_id: issue.shortId,
    title: issue.title,
    culprit: issue.culprit,
    level: issue.level,
    status: issue.status,
    count: issue.count,
    users: issue.userCount,
    first_seen: issue.firstSeen,
    last_seen: issue.lastSeen,
    permalink: issue.permalink,
  }));
}

async function querySentryViaSupabase() {
  const appEnv = loadLocalEnv(resolve(process.cwd(), '.env'));
  const accountsPath = resolve(process.cwd(), '.codex-local', 'test-accounts.local.json');
  if (!existsSync(accountsPath)) {
    throw new Error('SENTRY_READ_TOKEN is empty and no local test account is available.');
  }
  const account = JSON.parse(readFileSync(accountsPath, 'utf8'))?.accounts?.nutritionist;
  const supabaseUrl = appEnv.VITE_SUPABASE_URL;
  const anonKey = appEnv.VITE_SUPABASE_ANON_KEY;
  if (!account?.email || !account?.password || !supabaseUrl || !anonKey) {
    throw new Error('Supabase proxy fallback is not configured.');
  }

  const auth = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  return requestJson(`${supabaseUrl}/functions/v1/sentry-proxy`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${auth.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: issueId ? 'latest_event' : 'issues',
      issue_id: issueId || undefined,
      correlation_id: correlation || undefined,
      hours,
      limit,
    }),
  });
}

function posthogHost() {
  const configured = env.POSTHOG_API_HOST || 'https://us.posthog.com';
  return configured.replace('://us.i.', '://us.').replace('://eu.i.', '://eu.').replace(/\/$/, '');
}

async function queryPosthog() {
  required(['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID']);
  const correlationFilter = correlation
    ? `AND properties.correlation_id = '${correlation}'`
    : '';
  const query = `
    SELECT
      timestamp,
      event,
      properties.correlation_id,
      properties.operation,
      properties.module,
      properties.source,
      properties.error_code,
      properties.http_status,
      properties.route,
      properties.app_release,
      properties.environment,
      distinct_id
    FROM events
    WHERE timestamp >= now() - INTERVAL ${hours} HOUR
      AND event = 'operation_failed'
      ${correlationFilter}
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;

  return requestJson(`${posthogHost()}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: { kind: 'HogQLQuery', query },
      name: 'nello_codex_bug_diagnosis',
    }),
  });
}

async function health() {
  required(['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID']);
  const [sentry, posthog] = await Promise.all([
    querySentry(),
    queryPosthog(),
  ]);
  return {
    sentry: { connected: true, result_count: Array.isArray(sentry) ? sentry.length : 1 },
    posthog: { connected: true, columns: posthog.columns || [] },
  };
}

if (args.includes('--help')) {
  console.log('Usage: npm run diagnose:observability -- [all|sentry|posthog|health] [--hours=24] [--limit=25] [--correlation=<id>] [--issue=<sentry_issue_id>]');
  process.exit(0);
}

const output = command === 'sentry'
  ? { sentry: await querySentry() }
  : command === 'posthog'
    ? { posthog: await queryPosthog() }
    : command === 'health'
      ? await health()
      : { sentry: await querySentry(), posthog: await queryPosthog() };

console.log(JSON.stringify(output, null, 2));
