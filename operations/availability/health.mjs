const checks = {
  auth: { path: '/auth/v1/settings', type: /^application\/json\b/i, valid: body => typeof body?.external?.email === 'boolean' },
  // A zero-row query proves a real database transaction without returning food
  // or clinical records. Hosted projects need not expose root OpenAPI metadata.
  database: { path: '/rest/v1/foods?select=id&limit=0', type: /^application\/json\b/i, valid: body => Array.isArray(body) && body.length === 0 },
  storage: { path: '/storage/v1/health', type: /^application\/json\b/i, valid: body => body?.healthy === true },
};

// Only public settings and a zero-row catalog query are requested. Never use
// service-role credentials or read clinical records in this endpoint.
export async function inspectHealth({ env = process.env, fetcher = fetch, timeoutMs = 2500, totalBudgetMs = 4500, onDiagnostic = () => {} } = {}) {
  const checkedAt = new Date().toISOString();
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  let origin;
  try {
    const url = new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error();
    if (url.protocol !== 'https:' && !((env.NELLO_LOCAL_QA === 'isolated' || env.CI === 'true' && env.GITHUB_ACTIONS === 'true')
      && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error();
    if (!key || /[\r\n]/.test(key)) throw new Error();
    if (key.startsWith('sb_secret_')) throw new Error();
    if (key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role !== 'anon') throw new Error();
    origin = url.origin;
  } catch {
    return { schemaVersion: 1, status: 'unavailable', checkedAt,
      checks: { auth: 'unavailable', database: 'unavailable', storage: 'unavailable' } };
  }
  const entries = await Promise.all(Object.entries(checks).map(async ([name, check]) => {
    const started = performance.now();
    const failures = [];
    let available = false;
    let attempts = 0;
    // Read-only probes: one transient retry, one shared deadline, no healthy cache.
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = totalBudgetMs - (performance.now() - started);
      if (remaining <= 0) break;
      attempts++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
      let reason = 'network';
      let retryable = true;
      try {
      const result = await fetcher(`${origin}${check.path}`, {
        headers: { apikey: key, Accept: 'application/json', ...(key.split('.').length === 3 ? { Authorization: `Bearer ${key}` } : {}) },
        signal: controller.signal, redirect: 'error',
      });
      if (result.status !== 200) {
        reason = [429, 502, 503, 504].includes(result.status) ? `http_${result.status}` : 'http_rejected';
        retryable = [502, 503, 504].includes(result.status);
        await result.body?.cancel();
        throw new Error();
      }
      reason = 'invalid_contract';
      retryable = false;
      if (!check.type.test(result.headers.get('content-type') || '')) {
        await result.body?.cancel();
        throw new Error();
      }
      // Read incrementally to bound memory, including malformed upstream bodies.
      const reader = result.body.getReader();
      const chunks = [];
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.length;
          if (bytes > 65536) throw new Error();
          chunks.push(Buffer.from(chunk.value));
        }
      } finally { await reader.cancel(); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!check.valid(body)) throw new Error();
      available = true;
      break;
      } catch {
        if (controller.signal.aborted) { reason = 'timeout'; retryable = true; }
        failures.push(reason);
        if (!retryable) break;
      } finally { clearTimeout(timer); }
    }
    if (failures.length) {
      // No provider URL/body, token, free-form error, user, or clinical data.
      // Logging failures cannot change the actual health outcome.
      try { onDiagnostic({ dependency: name, attempts, failures, recovered: available,
        durationMs: Math.round(performance.now() - started), checkedAt }); } catch { /* best effort */ }
    }
    return [name, available ? 'operational' : 'unavailable'];
  }));
  const statuses = Object.fromEntries(entries);
  const available = entries.filter(([, status]) => status === 'operational').length;
  return { schemaVersion: 1, status: available === entries.length ? 'operational'
    : available ? 'degraded' : 'unavailable', checkedAt, checks: statuses };
}
