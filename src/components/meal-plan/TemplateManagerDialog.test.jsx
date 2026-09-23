import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TemplateManagerDialog from './TemplateManagerDialog';
import { cloneDietTemplateToPatient, getDietTemplateWithMeals } from '@/lib/supabase/template-queries';
import { getMealPlanById } from '@/lib/supabase/meal-plan-queries';
import { getLatestEnergyCalculation } from '@/lib/supabase/energy-queries';

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

const mockFetchTemplates = vi.fn();
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: [
      { id: '1', name: 'Dieta Hipertrofia', description: 'Para ganho de massa', tags: ['hipertrofia'] },
      { id: '2', name: 'Dieta Emagrecimento', description: 'Para perda de gordura', tags: ['emagrecimento'] }
    ],
    loading: false,
    fetchTemplates: mockFetchTemplates
  })
}));

vi.mock('@/lib/supabase/template-queries', () => ({
  cloneDietTemplateToPatient: vi.fn(),
  getDietTemplateWithMeals: vi.fn(),
  getUnavailableTemplateFoods: (meals = []) => meals.flatMap(meal => (meal.foods || [])
    .filter(item => !item.food || item.food.is_active === false)
    .map(item => ({ meal: meal.name, name: item.food?.name || 'Alimento removido', id: item.food_id, reason: 'desativado' })))
}));

vi.mock('@/lib/supabase/meal-plan-queries', () => ({
  getMealPlanById: vi.fn()
}));

vi.mock('@/lib/supabase/energy-queries', () => ({
  getLatestEnergyCalculation: vi.fn()
}));

describe('TemplateManagerDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnTemplateApplied = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getLatestEnergyCalculation.mockResolvedValue({ data: null });
    getMealPlanById.mockResolvedValue({ data: null });
    getDietTemplateWithMeals.mockResolvedValue({ data: { meals: [{ id: 'meal-1', name: 'Almoço', foods: [{ food_id: 'food-1', food: { name: 'Arroz', is_active: true } }], calories: 100, protein: 2, carbs: 20, fat: 1 }] } });
  });

  it('blocks a protocol with an unavailable food before calling the clone RPC', async () => {
    getDietTemplateWithMeals.mockResolvedValue({ data: { meals: [{ id: 'meal-1', name: 'Almoço', foods: [{ food_id: 'food-1', food: null }] }] } });
    render(<TemplateManagerDialog open patientId="p-123" nutritionistId="n-123" onOpenChange={mockOnOpenChange} />);
    fireEvent.click(screen.getByText('Dieta Hipertrofia').closest('button'));
    const button = await screen.findByText('Aplicar "Dieta Hipertrofia" ao Paciente');
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(screen.getByRole('alert').textContent).toContain('food-1');
    expect(cloneDietTemplateToPatient).not.toHaveBeenCalled();
  });

  it('renders correctly when open', async () => {
    render(
      <TemplateManagerDialog 
        open={true} 
        onOpenChange={mockOnOpenChange} 
        patientId="p-123" 
        nutritionistId="n-123" 
      />
    );

    // Wait for async effects to settle
    await waitFor(() => {
      expect(screen.getByText('Importar Protocolo de Dieta')).toBeDefined();
    });

    expect(screen.getByText('Dieta Hipertrofia')).toBeDefined();
    expect(screen.getByText('Dieta Emagrecimento')).toBeDefined();
  });

  it('allows selecting a template and applying it', async () => {
    cloneDietTemplateToPatient.mockResolvedValue('new-plan-id');
    getMealPlanById.mockResolvedValue({ data: { id: 'new-plan-id', name: 'Dieta Hipertrofia', meals: [] } });
    getLatestEnergyCalculation.mockResolvedValue({ data: { final_planned_kcal: 2000 } });

    render(
      <TemplateManagerDialog 
        open={true} 
        onOpenChange={mockOnOpenChange} 
        patientId="p-123" 
        nutritionistId="n-123"
        onTemplateApplied={mockOnTemplateApplied}
      />
    );

    // Esperar o carregamento inicial (energy queries etc)
    await waitFor(() => {
      expect(screen.getByText('Dieta Hipertrofia')).toBeDefined();
    });

    // Selecionar o template (clicar no botão pai que contém o h3)
    const templateElement = screen.getByText('Dieta Hipertrofia');
    const button = templateElement.closest('button');
    fireEvent.click(button);

    // O botão de confirmar deve aparecer
    const confirmBtn = await screen.findByText('Aplicar "Dieta Hipertrofia" ao Paciente');
    expect(confirmBtn).toBeDefined();

    // Clicar em aplicar
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(cloneDietTemplateToPatient).toHaveBeenCalledWith('1', 'p-123', 'n-123', 'Dieta Hipertrofia');
      // expect(getMealPlanById).toHaveBeenCalledWith('new-plan-id'); // já é chamado no mock acima
      expect(mockOnTemplateApplied).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-plan-id' }));
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
