import { describe, it, expect, vi } from 'vitest';
import { cloneDietTemplateToPatient, cloneMealTemplateToPlan } from './template-queries';
import { supabase } from '@/lib/customSupabaseClient';

// Mock do supabase client
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

describe('Template Queries', () => {
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

    await expect(cloneDietTemplateToPatient('template-1', 'patient-1', 'nutri-1')).rejects.toEqual(errorMsg);
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
