// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { assessChecks, checkBudget, deliverAlert, readProviderChecks } from './provider-burn-rate.mjs';

const now = Date.parse('2026-10-01T12:00:00Z');
const samples = Array.from({ length: 361 }, (_, index) => ({ timestamp: now - (360 - index) * 60000, ok: index < 356 }));
const rows = samples.map(row => ({ scheduledCheckTime: new Date(row.timestamp).toISOString(), checkStatus: row.ok ? 'success' : 'failure', httpStatusCode: row.ok ? 200 : 503, assertionFailureData: 'private-patient', traceId: 'secret-token' }));
const dsn = 'https://public-key@ingest.example.invalid/42';
const metadata = { id: '10435462', enabled: true, config: { environment: 'production' }, dataSources: [{ type: 'uptime_subscription', queryObj: { url: 'https://nellonutri.com.br/api/health', method: 'GET', intervalSeconds: 60, headers: [], body: null, traceSampling: false, responseCaptureEnabled: false } }] };

function provider(data = rows, ingestStatus = 200) {
  return vi.fn(async url => {
    if (String(url).includes('/envelope/')) return new Response('', { status: ingestStatus });
    if (String(url).includes('/detectors/')) return Response.json(metadata);
    const page = Number(new URL(url).searchParams.get('cursor') || 0);
    const next = new URL(url); next.searchParams.set('cursor', String(page + 1));
    return Response.json(data.slice(page * 100, (page + 1) * 100), { headers: (page + 1) * 100 < data.length ? { link: `<${next}>; rel="next"; results="true"` } : {} });
  });
}

describe('durable external budget monitoring', () => {
  it('paginates provider history while retaining only timestamp and availability', async () => {
    const fetcher = provider();
    expect(await readProviderChecks({ token: 'synthetic-read-token', now, fetcher })).toEqual(samples);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it('requires both windows, treats gaps and duplicates as unknown, and does not backfill', () => {
    expect(assessChecks(samples, now).alerts).toEqual(['fast', 'sustained']);
    for (const data of [samples.filter((_, i) => i !== 358), [...samples, samples.at(-1)]]) expect(assessChecks(data, now).state).toBe('coverage_gap');
    expect(assessChecks(samples, now + 180000).state).toBe('coverage_gap');
    expect(assessChecks(samples.slice(-4), now).state).toBe('warming_up');
    expect(assessChecks(samples.map(row => ({ ...row, ok: true })), now).state).toBe('covered');
  });
  it('delivers signals once, persists throttle across restarts, and retries failed delivery', async () => {
    const fetcher = provider();
    const first = await checkBudget({ token: 'synthetic', dsn, now, fetcher });
    expect(first.attempts).toEqual([{ kind: 'fast', delivered: true }, { kind: 'sustained', delivered: true }]);
    const next = await checkBudget({ token: 'synthetic', dsn, now: now + 50000, fetcher, previous: JSON.parse(JSON.stringify(first)) });
    expect(next.attempts).toEqual([]);
    const failed = await checkBudget({ token: 'synthetic', dsn, now, fetcher: provider(rows, 503) });
    expect(failed.deliveries).toEqual({});
    expect((await checkBudget({ token: 'synthetic', dsn, now, fetcher, previous: failed })).attempts).toHaveLength(2);
  });
  it('alerts on provider access failure without publishing its body or credentials', async () => {
    const fetcher = vi.fn(async url => String(url).includes('/envelope/') ? new Response('') : new Response('private-patient secret-token', { status: 403 }));
    const result = await checkBudget({ token: 'secret-token', dsn, now, fetcher });
    expect(result.active).toEqual(['provider_unavailable']);
    expect(result.attempts[0].delivered).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private-patient|secret-token/);
  });
  it('never forwards a provider credential through a foreign pagination link', async () => {
    const fetcher = vi.fn(async url => String(url).includes('/detectors/') ? Response.json(metadata) : Response.json([], { headers: { link: '<https://attacker.example.invalid/>; rel="next"; results="true"' } }));
    await expect(readProviderChecks({ token: 'synthetic', now, fetcher })).rejects.toThrow('invalid_provider_pagination');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('refuses a changed monitor target before reading or trusting its history', async () => {
    const changed = structuredClone(metadata); changed.dataSources[0].queryObj.url = 'https://other.example.invalid/';
    const fetcher = vi.fn(async () => Response.json(changed));
    await expect(readProviderChecks({ token: 'synthetic', now, fetcher })).rejects.toThrow('monitor_configuration_changed');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('labels controlled delivery independently from genuine incidents', async () => {
    const fetcher = vi.fn(async () => new Response(''));
    expect(await deliverAlert('fast', { dsn, fetcher, controlled: true })).toBe(true);
    const event = JSON.parse(fetcher.mock.calls[0][1].body.split('\n')[2]);
    expect(event.tags.source).toBe('controlled_probe');
    expect(event.tags['error.code']).toBe('OBS_PROBE');
    expect(event.fingerprint).toContain('controlled-validation');
  });
});
