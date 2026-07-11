import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useTemplateBuilder } from './useTemplateBuilder';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

// Mocks
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast })
}));

describe('useTemplateBuilder Hook', () => {
  const mockUser = { id: 'user-123' };
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });
    useNavigate.mockReturnValue(mockNavigate);
    supabase.rpc.mockResolvedValue({ data: { id: 'mocked-uuid' }, error: null });
    
    // Setup supabase mocks
    const singleMock = vi.fn().mockResolvedValue({ data: { id: 'mocked-uuid' }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    
    const insertResult = {
      select: selectMock,
      error: null
    };
    
    // Fazer o objeto retornado pelo insertMock ser um thenable que resolve automaticamente
    // para evitar o hanging (timeout) quando await insert() é chamado direto
    insertResult.then = function(resolve) {
      resolve({ error: null });
    };

    const insertMock = vi.fn().mockReturnValue(insertResult);

    supabase.from.mockReturnValue({
      insert: insertMock,
    });
  });

  it('should initialize with default formData', () => {
    const { result } = renderHook(() => useTemplateBuilder('diet'));
    
    expect(result.current.formData.name).toBe('');
    expect(result.current.formData.meals).toEqual([]);
    expect(result.current.formData.tags).toEqual([]);
  });

  it('should prevent save if name is empty', async () => {
    const { result } = renderHook(() => useTemplateBuilder('diet'));
    
    await act(async () => {
      await result.current.handleSave();
    });

    expect(mockToast).toHaveBeenCalledWith({ title: 'Nome obrigatório', description: 'Informe um nome para o template.', variant: 'destructive' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('should save a diet template successfully without meals', async () => {
    const { result } = renderHook(() => useTemplateBuilder('diet'));
    
    act(() => {
      result.current.setFormData(prev => ({ ...prev, name: 'Dieta Teste' }));
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(supabase.rpc).toHaveBeenCalledWith('create_diet_template', {
      p_user_id: 'user-123',
      p_name: 'Dieta Teste',
      p_description: null,
      p_tags: [],
      p_meals: [],
    });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Sucesso', description: 'Dieta Padrão criada com sucesso!' });
    expect(mockNavigate).toHaveBeenCalledWith('/nutritionist/templates');
  });

  it('should save a meal template with foods successfully', async () => {
    const { result } = renderHook(() => useTemplateBuilder('meal'));
    
    act(() => {
      result.current.setFormData(prev => ({ 
        ...prev, 
        name: 'Refeição Teste',
        foods: [{ food_id: 'food-1', quantity: 100, unit: 'gram', observation: 'cozido' }]
      }));
    });

    await act(async () => {
      await result.current.handleSave();
    });

    expect(supabase.from).toHaveBeenCalledWith('meal_templates');
    expect(supabase.from).toHaveBeenCalledWith('meal_template_foods');
    expect(mockToast).toHaveBeenCalledWith({ title: 'Sucesso', description: 'Refeição salva com sucesso!' });
  });
});
