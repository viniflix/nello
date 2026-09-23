import { describe, it, expect, vi } from 'vitest';
import { cloneDietTemplateToPatient, cloneMealTemplateToPlan, getFoodsMapByIds, getUnavailableTemplateFoods, importDietTemplateMealsToPlan } from './template-queries';
import { supabase } from '@/lib/customSupabaseClient';

// Mock do supabase client
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

describe('Template Queries', () => {
  it('propagates a food query failure instead of returning an empty map', async () => {
    const failure = new Error('permission denied');
    const query = { select: vi.fn(), in: vi.fn() };
    query.select.mockReturnValue(query);
    query.in.mockResolvedValue({ data: null, error: failure });
    supabase.from.mockReturnValue(query);
    await expect(getFoodsMapByIds(['food-1'])).rejects.toThrow('permission denied');
  });

  it('identifies unavailable primary foods and substitutes by meal and ID', () => {
    expect(getUnavailableTemplateFoods([{ name: 'Almoço', foods: [
      { food_id: 'food-1', food: null, substitutes: [{ substitute_food_id: 'sub-1', food: { name: 'Substituto', is_active: false } }] }
    ] }])).toEqual(expect.arrayContaining([
      expect.objectContaining({ meal: 'Almoço', id: 'food-1' }),
      expect.objectContaining({ meal: 'Almoço', id: 'sub-1' })
    ]));
  });

  it('imports selected meals in one atomic RPC call', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: [11, 12], error: null });
    await expect(importDietTemplateMealsToPlan('template-1', 8, ['meal-1', 'meal-2'])).resolves.toEqual([11, 12]);
    expect(supabase.rpc).toHaveBeenCalledWith('import_diet_template_meals_to_plan', {
      p_template_id: 'template-1', p_plan_id: 8, p_meal_ids: ['meal-1', 'meal-2']
    });
  });
  it('should call clone_diet_template_to_patient RPC with correct arguments', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 123, error: null });

    const result = await cloneDietTemplateToPatient('template-1', 'patient-1', 'nutri-1', 'Plano Clone');

    expect(supabase.rpc).toHaveBeenCalledWith('clone_diet_template_to_patient', {
      p_template_id: 'template-1',
      p_patient_id: 'patient-1',
      p_nutritionist_id: 'nutri-1',
      p_name: 'Plano Clone'
    });
    expect(result).toBe(123);
  });

  it('should handle error when clone_diet_template_to_patient fails', async () => {
    const errorMsg = { message: 'Database error' };
    supabase.rpc.mockResolvedValueOnce({ data: null, error: errorMsg });

    await expect(cloneDietTemplateToPatient('template-1', 'patient-1', 'nutri-1')).rejects.toThrow('Não foi possível importar o protocolo. Tente novamente mais tarde.');
  });

  it('should call clone_meal_template_to_plan RPC with correct arguments', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: 456, error: null });

    const result = await cloneMealTemplateToPlan('meal-template-1', 789, 'lunch', '12:00');

    expect(supabase.rpc).toHaveBeenCalledWith('clone_meal_template_to_plan', {
      p_meal_template_id: 'meal-template-1',
      p_meal_plan_id: 789,
      p_meal_type: 'lunch',
      p_meal_time: '12:00'
    });
    expect(result).toBe(456);
  });
});
