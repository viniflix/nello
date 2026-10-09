// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { assessPipeline, monitorPipeline } from './pipeline-monitor.mjs';

const metadata = { schemaVersion: 1, environment: 'production', release: 'a'.repeat(40) };
const options = { readToken: 'synthetic-read-key', captureKey: 'phc_synthetic', now: 1000000 };
function provider(count = 1, invalid = 0) {
  return vi.fn(async url => new Response(JSON.stringify(String(url).endsWith('release.json') ? metadata : String(url).endsWith('query/') ? { results: [[count, invalid]] } : { status: 1 }), { status: 200 }));
}
describe('independent analytics monitoring', () => {
  it('locates a forbidden query without exposing provider messages or credentials', async () => {
    const fetcher = provider();
    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify(metadata)))
      .mockImplementationOnce(async () => new Response('{"status":"Ok"}'))
      .mockImplementationOnce(async () => new Response('PRIVATE_PROVIDER_SENTINEL synthetic-read-key', { status: 403 }));
    const result = await assessPipeline({ ...options, fetcher });
    expect(result).toMatchObject({ state: 'attention', signals: ['pipeline_unavailable'], diagnostic: { stage: 'query', reason: 'http_error', httpStatus: 403 } });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_PROVIDER_SENTINEL|synthetic-read-key|phc_synthetic/);
  });
  it('distinguishes capture timeout from malformed query data without copying raw errors', async () => {
    const timed = provider();
    timed.mockImplementationOnce(async () => new Response(JSON.stringify(metadata)))
      .mockImplementationOnce(async () => { throw new DOMException('PRIVATE_TIMEOUT_SENTINEL', 'TimeoutError'); });
    expect(await assessPipeline({ ...options, fetcher: timed })).toMatchObject({ diagnostic: { stage: 'capture', reason: 'timeout' } });
    const invalid = provider();
    invalid.mockImplementationOnce(async () => new Response(JSON.stringify(metadata)))
      .mockImplementationOnce(async () => new Response('{"status":"Ok"}'))
      .mockImplementationOnce(async () => new Response('{"results":[["PRIVATE_PAYLOAD",0]]}'));
    const result = await assessPipeline({ ...options, fetcher: invalid });
    expect(result.diagnostic).toEqual({ stage: 'query', reason: 'invalid_provider_response' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PAYLOAD');
  });
  it('does not count a previous release probe as evidence for the current deployment', async () => {
    const fetcher = vi.fn(async (url, request) => {
      if (String(url).endsWith('query/')) {
        const query = JSON.parse(request.body).query.query;
        const scoped = query.includes(`AND properties.app_release = '${metadata.release}'`);
        return new Response(JSON.stringify({ results: [[scoped ? 0 : 12, 0]] }));
      }
      return new Response(JSON.stringify(String(url).endsWith('release.json') ? metadata : { status: 1 }));
    });
    expect(await assessPipeline({ ...options, fetcher })).toMatchObject({
      release: metadata.release, state: 'warming_up', probeCount: 0, silentChecks: 1,
    });
  });
  it('starts a fresh ingestion grace period when the deployment changes', async () => {
    expect(await assessPipeline({ ...options, fetcher: provider(0), previous: {
      release: 'b'.repeat(40), checkedAt: new Date(options.now - 300000).toISOString(), silentChecks: 2,
    } })).toMatchObject({ state: 'warming_up', silentChecks: 1, signals: [] });
  });
  it('does not let a previously healthy cached aggregate hide a stopped pipeline', async () => {
    const fetcher = vi.fn(async (url, request) => {
      if (String(url).endsWith('query/')) {
        const fresh = JSON.parse(request.body).refresh === 'force_blocking';
        return new Response(JSON.stringify({ results: [[fresh ? 0 : 9, 0]] }));
      }
      return new Response(JSON.stringify(String(url).endsWith('release.json') ? metadata : { status: 1 }));
    });
    let previous = {};
    for (let check = 0; check < 3; check++) previous = await assessPipeline({ ...options, now: options.now + check * 300000, fetcher, previous });
    expect(previous).toMatchObject({ state: 'attention', probeCount: 0, signals: ['ingestion_silent'] });
  });
  it('checks a fictitious ingestion probe rather than treating no user activity as an outage', async () => {
    const fetcher = provider();
    expect(await assessPipeline({ ...options, fetcher })).toMatchObject({ state: 'ingestion_verified', signals: [], probeCount: 1 });
    const envelope = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(envelope.properties).toMatchObject({ distinct_id: 'nello-pipeline-monitor-v1', audience: 'qa', $process_person_profile: false });
    expect(envelope).not.toHaveProperty('user');
    expect(fetcher.mock.calls.every(([, request]) => request.redirect === 'error')).toBe(true);
  });
  it('tolerates ingestion lag but detects consecutive silent checks and a broken release', async () => {
    const fetcher = provider(0, 1);
    const first = await assessPipeline({ ...options, fetcher });
    expect(first.signals).toEqual(['invalid_release']);
    const second = await assessPipeline({ ...options, now: options.now + 300000, fetcher, previous: first });
    const third = await assessPipeline({ ...options, now: options.now + 600000, fetcher, previous: second });
    expect(third.signals).toEqual(['ingestion_silent', 'invalid_release']);
    expect((await assessPipeline({ ...options, fetcher: provider(), previous: third })).silentChecks).toBe(0);
  });
  it('does not carry silent checks across a long observation gap', async () => {
    expect((await assessPipeline({ ...options, fetcher: provider(0), previous: { checkedAt: new Date(0).toISOString(), silentChecks: 8 } })).silentChecks).toBe(1);
  });
  it('rejects missing credentials, invalid metadata and malformed provider aggregates', async () => {
    expect((await assessPipeline()).signals).toEqual(['pipeline_unavailable']);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ...metadata, release: 'development' })));
    expect(await assessPipeline({ ...options, fetcher })).toMatchObject({ state: 'attention', signals: ['invalid_release'] });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const invalid = provider(); invalid.mockImplementationOnce(async () => new Response(JSON.stringify(metadata))).mockImplementationOnce(async () => new Response('{}')).mockImplementationOnce(async () => new Response('{"results":[["private payload",0]]}'));
    expect((await assessPipeline({ ...options, fetcher: invalid })).signals).toEqual(['pipeline_unavailable']);
  });
  it('groups alerts, retries failed delivery and does not serialize provider exceptions', async () => {
    const fetcher = vi.fn(async url => {
      if (String(url).includes('envelope')) return new Response('', { status: 200 });
      throw Error('PRIVATE_PROVIDER_SENTINEL');
    });
    const dsn = 'https://public@monitor.example.invalid/1';
    const result = await monitorPipeline({ ...options, fetcher, dsn });
    expect(result.attempts).toEqual([{ kind: 'pipeline_unavailable', delivered: true }]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVIDER_SENTINEL');
    expect((await monitorPipeline({ ...options, now: options.now + 300000, previous: result, fetcher, dsn })).attempts).toEqual([]);
    const failed = { ...result, deliveries: {} };
    expect((await monitorPipeline({ ...options, now: options.now + 300000, previous: failed, fetcher, dsn })).attempts).toHaveLength(1);
  });
});
