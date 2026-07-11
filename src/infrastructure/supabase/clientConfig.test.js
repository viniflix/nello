import { describe, expect, it } from 'vitest';
import { createSupabaseClientOptions } from './clientConfig';

describe('createSupabaseClientOptions', () => {
  it('preserves session and realtime behavior', () => {
    expect(createSupabaseClientOptions()).toEqual({
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  });
});
