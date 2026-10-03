import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36' });

test('real analytics SDK respects default denial and immediate revocation', async ({ page }) => {
  const sent = [];
  await page.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Isolated privacy fixture</body></html>' }));
  await page.route('**/array/**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/flags/**', route => route.fulfill({ contentType: 'application/json', body: '{"featureFlags":{}}' }));
  await page.route('**/e/**', async route => {
    let bytes = route.request().postDataBuffer();
    if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
    const body = JSON.parse(bytes.toString());
    sent.push(...(Array.isArray(body) ? body : body.batch || [body]));
    await route.fulfill({ contentType: 'application/json', body: '{"status":"Ok"}' });
  });
  await page.goto('/login');
  const state = await page.evaluate(async () => { const { syntheticAnalyticsPrivacyBoundary } = await import('/__qa__/harness.js'); return syntheticAnalyticsPrivacyBoundary(); });
  expect(state.optedOut).toBe(true);
  await expect.poll(() => sent.filter(event => event.event === 'ui_action_outcome' && event.properties.operation === 'qa_explicit_grant').length).toBe(1);
  expect(sent.some(event => ['qa_default_denied', 'qa_revoked_denied'].includes(event.properties.operation) || event.event === 'qa_unknown_event')).toBe(false);
  expect(JSON.stringify(sent)).not.toContain('PRIVATE_SYNTHETIC_SENTINEL');
});

test('real analytics SDK sends sanitized events with routing token and separates users after logout', async ({ page }) => {
  const sent = [];
  const errors = [];
  await page.route('**/api/1/envelope/**', async route => {
    const lines = route.request().postData().split('\n');
    for(let i=1;i<lines.length;i+=2) if(JSON.parse(lines[i]).type==='event')errors.push(JSON.parse(lines[i+1]));
    await route.fulfill({ contentType: 'application/json', body: '{}' });
  });
  await page.route('**/login', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body>Isolated SDK transport fixture</body></html>' }));
  await page.route('**/array/**/config.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/flags/**', route => route.fulfill({ contentType: 'application/json', body: '{"featureFlags":{}}' }));
  await page.route('**/e/**', async route => {
    let bytes = route.request().postDataBuffer();
    if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
    const body = JSON.parse(bytes.toString());
    const events = Array.isArray(body) ? body : body.batch || [body];
    sent.push(...events);
    const valid = events.every(event => event.properties?.token === 'phc_nello_synthetic_telemetry');
    await route.fulfill({ status: valid ? 200 : 401, contentType: 'application/json', body: JSON.stringify({ status: valid ? 'Ok' : 'event submitted without an api_key' }) });
  });
  await page.goto('/login');
  const state = await page.evaluate(async () => { const { syntheticAnalyticsTransport } = await import('/__qa__/harness.js'); return syntheticAnalyticsTransport(); });
  expect(state).toEqual({ loaded: true });
  await expect.poll(() => sent.filter(event => event.event === 'operation_failed').length).toBe(2);
  const failures = sent.filter(event => event.event === 'operation_failed');
  expect(failures.every(event => event.properties.token === 'phc_nello_synthetic_telemetry')).toBe(true);
  expect(failures.map(event => event.properties.distinct_id)).toEqual(['9ba45c9b-d0d4-490d-96a0-6addd7826833', '1ba45c9b-d0d4-490d-96a0-6addd7826833']);
  expect(failures.map(event => event.properties.correlation_id)).toEqual(failures.map(event => event.properties.distinct_id));
  expect(failures[0].properties.session_id).not.toBe(failures[1].properties.session_id);
  for (const event of ['anthropometry_saved', 'energy_calc_performed', 'meal_plan_published']) {
    const confirmed = sent.filter(item => item.event === event);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].properties).toMatchObject({ distinct_id: failures[0].properties.distinct_id, outcome: 'succeeded', audience: 'qa', event_schema_version: 1 });
  }
  expect(sent.every(item => item.properties.event_schema_version === 1 && item.properties.audience === 'qa')).toBe(true);
  const correlation = await page.evaluate(async () => { const { syntheticSentryTransport } = await import('/__qa__/harness.js'); return syntheticSentryTransport(); });
  await expect.poll(() => errors.length).toBe(1);
  await expect.poll(() => sent.filter(item => item.properties.correlation_id === correlation).length).toBe(1);
  expect(errors[0].tags['correlation.id']).toBe(correlation);
  expect(errors[0].fingerprint[1]).toBe(sent.find(item=>item.properties.correlation_id===correlation).properties.session_id);
  expect(errors[0].contexts.operation).toMatchObject({ error_code: 'NETWORK_FAILURE', http_status: 503, cause_reason: 'network_failure', failure_kind: 'technical' });
  expect(JSON.stringify(errors)).not.toContain('PRIVATE_SYNTHETIC_SENTINEL');
  expect(JSON.stringify(sent)).not.toContain('PRIVATE_SYNTHETIC_SENTINEL');
});
