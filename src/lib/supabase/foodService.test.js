import { describe, expect, it, vi } from 'vitest';

const { mockFrom, mockSelect, mockIlike, mockRange, response } = vi.hoisted(() => ({
  mockFrom: vi.fn(), mockSelect: vi.fn(), mockIlike: vi.fn(), mockRange: vi.fn(),
  response: { current: { data: [], error: null } },
}));

vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: mockFrom } }));

const { searchFoodsPaginated } = await import('./foodService');

describe('busca paginada de alimentos', () => {
  it('trata curingas digitados como texto e busca além da linha 1.000 sem contar toda a view', async () => {
    const query = {
      select: mockSelect, eq: vi.fn(), ilike: mockIlike, order: vi.fn(), range: mockRange,
      then: (resolve, reject) => Promise.resolve(response.current).then(resolve, reject),
    };
    for (const method of ['select', 'eq', 'ilike', 'order', 'range']) query[method].mockReturnValue(query);
    mockFrom.mockReturnValue(query);
    response.current = { data: Array.from({ length: 21 }, (_, id) => ({ id })), error: null };

    const result = await searchFoodsPaginated('%_', 50);

    expect(mockIlike).toHaveBeenCalledWith('name', '%\\%\\_%');
    expect(mockRange).toHaveBeenCalledWith(1000, 1020);
    expect(mockSelect.mock.calls[0][1]).toBeUndefined();
    expect(result.data).toHaveLength(20);
    expect(result.hasMore).toBe(true);
  });
  it('passes cancellation to the actual transport and keeps aborted searches out of result pages',async()=>{
    const controller=new AbortController();
    const query={select:vi.fn(),eq:vi.fn(),ilike:vi.fn(),order:vi.fn(),range:vi.fn(),abortSignal:vi.fn(),then:(resolve,reject)=>Promise.resolve({error:{name:'AbortError',message:'operation was aborted'}}).then(resolve,reject)};
    for(const method of ['select','eq','ilike','order','range','abortSignal'])query[method].mockReturnValue(query);
    mockFrom.mockReturnValue(query);
    await expect(searchFoodsPaginated('arroz',0,null,{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'});
    expect(query.abortSignal).toHaveBeenCalledWith(controller.signal);
  });
});
