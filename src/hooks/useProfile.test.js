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

  it('limita 503 a três transportes no orçamento único do perfil', async () => {
    state.fetch.mockImplementation(async () => new Response('{"code":"QA_PROFILE_UNAVAILABLE","message":"Synthetic outage"}', {
      status: 503, headers: { 'content-type': 'application/json' },
    }));
    const query = useProfile('00000000-0000-4000-8000-000000000001');
    const result = query.queryFn().catch(error => error);
    await vi.waitFor(() => expect(state.fetch).toHaveBeenCalled());
    await vi.runAllTimersAsync();
    expect(await result).toMatchObject({ code: 'QA_PROFILE_UNAVAILABLE' });
    expect(state.fetch).toHaveBeenCalledTimes(3);
    expect(query.retry).toBe(false);
  });
});

it('preserves the five-read profile trigger grace within one total budget',async()=>{
 vi.useFakeTimers();state.fetch.mockReset();state.fetch.mockImplementation(async()=>new Response(JSON.stringify({code:'PGRST116',message:'Missing'}),{status:406,headers:{'Content-Type':'application/json'}}));
 const q=useProfile('fictitious-new-profile');const work=q.queryFn().catch(error=>error);await vi.runAllTimersAsync();expect((await work).message).toBe('PROFILE_NOT_FOUND');expect(state.fetch).toHaveBeenCalledTimes(5);expect(q.retry).toBe(false);vi.useRealTimers();
});
