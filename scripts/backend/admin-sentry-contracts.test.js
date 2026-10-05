import { describe, expect, it } from 'vitest';
import { parseSentryRequest, nextSentryCursor, safeSentryIssue, safeSentryEvent } from '../../supabase/functions/sentry-proxy/contracts.js';
describe('admin Sentry boundary', () => {
  it('allows bounded fixed filters, never a client URL or query', () => {
    expect(parseSentryRequest({ action: 'issues_page', hours: 48, cursor: '1:2:0' }).environment).toBe('production');
    for (const body of [{ action: 'delete' }, { hours: 0 }, { hours: 12.5 }, { limit: 101 }, { cursor: 'https://evil.example' }, { release: 'x OR y' }, { environment: 'prod&secret=1' }]) expect(() => parseSentryRequest(body)).toThrow();
  });
  it('follows only an opaque next cursor with results', () => {
    expect(nextSentryCursor('<https://sentry.io/?cursor=0:0:1>; rel="previous"; results="false"; cursor="0:0:1", <https://sentry.io/?cursor=1:2:0>; rel="next"; results="true"; cursor="1:2:0"')).toBe('1:2:0');
    expect(nextSentryCursor('rel="next"; results="false"; cursor="1:2:0"')).toBeNull();
  });
  it('does not return private titles, email, paths, exception messages or user details', () => {
    const sentinel = 'PRIVATE_SENTINEL patient@example.invalid';
    const issue = safeSentryIssue({ id: '12', shortId: 'NELLO-1', type: 'error', title: sentinel, culprit: sentinel, count: '3', metadata: { type: 'TypeError', value: sentinel } });
    const event = safeSentryEvent({ entries: [{ type: 'exception', data: { values: [{ type: 'TypeError', value: sentinel, stacktrace: { frames: [{ inApp: true, filename: sentinel }] } }] } }], tags: [{ key: 'user', value: sentinel }] });
    expect(JSON.stringify([issue, event])).not.toContain('PRIVATE_SENTINEL');
    expect(issue.title).toBe('error · TypeError');
    expect(() => safeSentryIssue({ id: 'evil' })).toThrow();
  });
});
