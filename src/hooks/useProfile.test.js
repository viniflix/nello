import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useProfile } from './useProfile';

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: options => options }));
vi.mock('@/infrastructure/supabase/client', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://qa.example.invalid', 'synthetic-public-qa', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: state.fetch },
  }) };
});

describe('profile retry ownership', () => {
  beforeEach(() => { vi.useFakeTimers(); state.fetch.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it('propaga 503 em uma única tentativa do SDK, deixando as retentativas ao hook', async () => {
    state.fetch.mockImplementation(async () => new Response('{"code":"QA_PROFILE_UNAVAILABLE","message":"Synthetic outage"}', {
      status: 503, headers: { 'content-type': 'application/json' },
    }));
    const query = useProfile('00000000-0000-4000-8000-000000000001');
    const result = query.queryFn().catch(error => error);
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalled());
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ code: 'QA_PROFILE_UNAVAILABLE' });
    expect(state.fetch).toHaveBeenCalledTimes(1);
    expect(query.retry(1, new Error('network'))).toBe(true);
    expect(query.retry(2, new Error('network'))).toBe(false);
    expect(query.retry(3, new Error('PROFILE_NOT_FOUND'))).toBe(true);
    expect(query.retry(4, new Error('PROFILE_NOT_FOUND'))).toBe(false);
  });
});
