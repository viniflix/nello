import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { queryClient } from '@/app/config/queryClient';
import { useHouseholdMeasures } from './useHouseholdMeasures';
import { useActiveCustomMeasures } from './useCustomMeasures';
import { useFoodMeasures } from './useFoodMeasures';
import { getAllHouseholdMeasures } from '@/lib/supabase/food-measures-queries';
import { getCustomMeasures } from '@/lib/supabase/custom-measures-queries';
import { getFoodMeasures } from '@/lib/supabase/foodService';

const auth = vi.hoisted(() => ({ user: { id: 'actor-a' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/supabase/food-measures-queries', () => ({ getAllHouseholdMeasures: vi.fn() }));
vi.mock('@/lib/supabase/custom-measures-queries', () => ({
  getCustomMeasures: vi.fn(), getAllCustomMeasures: vi.fn(),
  createCustomMeasure: vi.fn(), updateCustomMeasure: vi.fn(), deleteCustomMeasure: vi.fn(),
}));
vi.mock('@/lib/supabase/foodService', () => ({ getFoodMeasures: vi.fn() }));

beforeEach(() => {
  queryClient.clear(); vi.resetAllMocks(); auth.user = { id: 'actor-a' };
  getAllHouseholdMeasures.mockResolvedValue({ data: [{ id: 1, code: 'g' }], error: null });
  getCustomMeasures.mockResolvedValue({ data: [{ id: 2, code: 'custom_a', grams_equivalent: 25 }], error: null });
  getFoodMeasures.mockResolvedValue([{ id: 'measure-a', grams: 40, quantity: 1 }]);
});
afterEach(() => { cleanup(); queryClient.clear(); });

it.each([1, 5, 20])('deduplicates %i simultaneous selectors without mixing their projections', async count => {
  const hooks = Array.from({ length: count }, () => renderHook(() => ({
    system: useHouseholdMeasures(), custom: useActiveCustomMeasures(), food: useFoodMeasures('food-a'),
  })));
  await waitFor(() => expect(hooks.every(h => !h.result.current.system.isLoading && !h.result.current.custom.isLoading && !h.result.current.food.isLoading)).toBe(true));
  expect(getAllHouseholdMeasures).toHaveBeenCalledTimes(1);
  expect(getCustomMeasures).toHaveBeenCalledTimes(1);
  expect(getFoodMeasures).toHaveBeenCalledTimes(1);
  for (const h of hooks) {
    expect(h.result.current.system.data[0].code).toBe('g');
    expect(h.result.current.custom.data[0].grams_equivalent).toBe(25);
    expect(h.result.current.food.data[0].grams).toBe(40);
  }
});

it('reuses fresh confirmed empty results on remount', async () => {
  getFoodMeasures.mockResolvedValue([]);
  const first = renderHook(() => useFoodMeasures('food-empty'));
  await waitFor(() => expect(first.result.current.isLoading).toBe(false)); first.unmount();
  const second = renderHook(() => useFoodMeasures('food-empty'));
  await waitFor(() => expect(second.result.current.isLoading).toBe(false));
  expect(second.result.current.data).toEqual([]); expect(getFoodMeasures).toHaveBeenCalledTimes(1);
});

it('keeps a shared flight alive when one selector unmounts', async () => {
  let finish;
  getFoodMeasures.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const first = renderHook(() => useFoodMeasures('food-a'));
  const second = renderHook(() => useFoodMeasures('food-a'));
  first.unmount(); await act(async () => finish([{ id: 'confirmed', grams: 40 }]));
  await waitFor(() => expect(second.result.current.data[0]?.id).toBe('confirmed'));
  expect(getFoodMeasures).toHaveBeenCalledTimes(1);
});
