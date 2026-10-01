import { test, expect } from '@playwright/test';
import { gunzipSync } from 'node:zlib';
test.use({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36' });

test('real analytics SDK sends sanitized events with routing token and separates users after logout', async ({ page }) => {
  const sent = [];
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
  expect(JSON.stringify(sent)).not.toContain('PRIVATE_SYNTHETIC_SENTINEL');
});
