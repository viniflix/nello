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
});
