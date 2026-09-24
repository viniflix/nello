import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabase } from '@/lib/customSupabaseClient';
import { savePatientDiaryMeal } from './food-diary-queries';

vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

const meal = {
  mealId: 42, mealDate: '2026-09-23', mealTime: '12:00', mealType: 'Almoço', notes: '',
  foods: [{ food_id: 'f87279d8-f8d6-4f11-b548-b7dcc7fdac93', food_source: 'TACO', food_name: 'Arroz', quantity: 100, unit: 'gram', calories: 130, protein: 2.5, carbs: 28, fat: 0.3 }],
};

describe('savePatientDiaryMeal', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uses one atomic RPC for an edited meal and normalizes the food source', async () => {
    supabase.rpc.mockResolvedValue({ data: 42, error: null });
    await expect(savePatientDiaryMeal(meal)).resolves.toBe(42);
    expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.rpc.mock.calls[0][1]).toMatchObject({
      p_meal_id: 42,
      p_payload: { meal_date: '2026-09-23', meal_type: 'Almoço' },
      p_items: [{ food_source: 'reference', food_id: meal.foods[0].food_id, quantity: 100 }],
    });
    expect(supabase.rpc.mock.calls[0][1].p_items[0]).not.toHaveProperty('calories');
  });

  it('rejects invalid food before contacting the database and propagates RPC failure', async () => {
    await expect(savePatientDiaryMeal({ ...meal, foods: [{ ...meal.foods[0], quantity: Number.NaN }] })).rejects.toThrow('Revise os valores');
    expect(supabase.rpc).not.toHaveBeenCalled();
    supabase.rpc.mockResolvedValue({ data: null, error: new Error('DIARY_INVALID_ITEM') });
    await expect(savePatientDiaryMeal(meal)).rejects.toThrow('DIARY_INVALID_ITEM');
  });
});
