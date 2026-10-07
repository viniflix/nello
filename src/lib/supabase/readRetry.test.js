import { describe, expect, it, vi } from 'vitest';
import { retryNetworkRead } from './readRetry';

describe('bounded retry for explicit reads', () => {
  const network = { message: 'TypeError: Failed to fetch' };
  it('recovers a single transport failure using a fresh read', async () => {
    const read = vi.fn().mockResolvedValueOnce({ error: network }).mockResolvedValueOnce({ data: ['synthetic'], error: null });
    expect(await retryNetworkRead(read)).toEqual({ data: ['synthetic'], error: null });
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('propagates persistent failure after at most two reads', async () => {
    const read = vi.fn().mockRejectedValue(network);
    await expect(retryNetworkRead(read)).rejects.toEqual(network);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not retry permission, schema, HTTP, cancellation or changed sessions', async () => {
    for (const error of [{ code: '42501', message: 'denied' }, { code: '42703', message: 'missing column' }, { ...network, status: 503 }, { ...network, name: 'AbortError' }]) {
      const read = vi.fn().mockResolvedValue({ error });
      expect(await retryNetworkRead(read)).toEqual({ error });
      expect(read).toHaveBeenCalledTimes(1);
    }
    const read = vi.fn().mockResolvedValue({ error: network });
    await retryNetworkRead(read, () => false);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('recovers only explicitly allowed gateway failures in read results', async () => {
    for (const status of [502, 503, 504]) {
      const read = vi.fn().mockResolvedValueOnce({ error: { message: 'Gateway unavailable' }, status })
        .mockResolvedValueOnce({ data: ['confirmed'], error: null });
      expect(await retryNetworkRead(read, () => true, { httpStatuses: [502, 503, 504] })).toEqual({ data: ['confirmed'], error: null });
      expect(read).toHaveBeenCalledTimes(2);
    }
    for (const status of [400, 401, 403, 429, 500]) {
      const read = vi.fn().mockResolvedValue({ error: { message: 'Denied' }, status });
      await retryNetworkRead(read, () => true, { httpStatuses: [502, 503, 504] });
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
  it('retains persistent gateway errors and prevents retries after identity changes', async () => {
    const unavailable = { error: { message: 'Gateway unavailable' }, status: 502 };
    const read = vi.fn().mockResolvedValue(unavailable);
    expect(await retryNetworkRead(read, () => true, { httpStatuses: [502] })).toEqual(unavailable);
    expect(read).toHaveBeenCalledTimes(2);
    read.mockClear();
    expect(await retryNetworkRead(read, () => false, { httpStatuses: [502] })).toEqual(unavailable);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
