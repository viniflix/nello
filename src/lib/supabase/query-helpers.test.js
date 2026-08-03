import { describe, expect, it } from 'vitest';
import { isExpectedRequestCancellation } from './query-helpers';

describe('isExpectedRequestCancellation', () => {
  it('recognizes an aborted signal', () => {
    const controller = new AbortController();
    controller.abort();
    expect(isExpectedRequestCancellation(new Error('failed'), controller.signal)).toBe(true);
  });

  it('recognizes browser abort errors without hiding ordinary failures', () => {
    expect(isExpectedRequestCancellation({ name: 'AbortError', message: 'The operation was aborted' })).toBe(true);
    expect(isExpectedRequestCancellation({ code: '42501', message: 'permission denied' })).toBe(false);
  });
});
