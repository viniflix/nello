import { describe, expect, it, vi } from 'vitest';
const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc: mockRpc } }));
const { searchFoodsPaginated } = await import('./foodService');
describe('ranked food search pagination', () => {
  it('sends literal query text and requests a bounded page beyond row 1000', async () => {
    mockRpc.mockResolvedValue({ data: Array.from({ length: 21 }, (_, id) => ({ id })), error: null });
    const result = await searchFoodsPaginated('%_', 50);
    expect(mockRpc).toHaveBeenCalledWith('search_foods_ranked', { p_query: '%_', p_source: null, p_limit: 21, p_offset: 1000 });
    expect(result.data).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });
  it('passes cancellation to transport and does not return aborted results', async () => {
    const controller = new AbortController();
    const query = { abortSignal: vi.fn(), then: (resolve, reject) => Promise.resolve({ error: { name: 'AbortError', message: 'operation was aborted' } }).then(resolve, reject) };
    query.abortSignal.mockReturnValue(query);
    mockRpc.mockReturnValue(query);
    await expect(searchFoodsPaginated('arroz', 0, null, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(query.abortSignal).toHaveBeenCalledWith(controller.signal);
  });
  it('does not request a one-character query', async () => {
    mockRpc.mockClear();
    expect(await searchFoodsPaginated('r')).toEqual({ data: [], hasMore: false, total: 0 });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
