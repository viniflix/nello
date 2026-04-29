import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TemplateManagerDialog from './TemplateManagerDialog';
import { cloneDietTemplateToPatient } from '@/lib/supabase/template-queries';
import { getMealPlanById } from '@/lib/supabase/meal-plan-queries';

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({
    templates: [
      { id: '1', name: 'Dieta Hipertrofia', description: 'Para ganho de massa', tags: ['hipertrofia'] },
      { id: '2', name: 'Dieta Emagrecimento', description: 'Para perda de gordura', tags: ['emagrecimento'] }
    ],
    loading: false,
    fetchTemplates: vi.fn()
  })
}));

vi.mock('@/lib/supabase/template-queries', () => ({
  cloneDietTemplateToPatient: vi.fn()
}));

vi.mock('@/lib/supabase/meal-plan-queries', () => ({
  getMealPlanById: vi.fn()
}));

describe('TemplateManagerDialog', () => {
  const mockOnOpenChange = vi.fn();
  const mockOnTemplateApplied = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
    render(
      <TemplateManagerDialog 
        open={true} 
        onOpenChange={mockOnOpenChange} 
        patientId="p-123" 
        nutritionistId="n-123" 
      />
    );

    expect(screen.getByText('Importar Dieta Padrão')).toBeDefined();
    expect(screen.getByText('Dieta Hipertrofia')).toBeDefined();
    expect(screen.getByText('Dieta Emagrecimento')).toBeDefined();
  });

  it('allows selecting a template and applying it', async () => {
    cloneDietTemplateToPatient.mockResolvedValue('new-plan-id');
    getMealPlanById.mockResolvedValue({ data: { id: 'new-plan-id', name: 'Dieta Hipertrofia' } });

    render(
      <TemplateManagerDialog 
        open={true} 
        onOpenChange={mockOnOpenChange} 
        patientId="p-123" 
        nutritionistId="n-123"
        onTemplateApplied={mockOnTemplateApplied}
      />
    );

    // Selecionar o template
    fireEvent.click(screen.getByText('Dieta Hipertrofia'));

    // O botão de confirmar deve aparecer
    const confirmBtn = screen.getByText('Confirmar Importação');
    expect(confirmBtn).toBeDefined();

    // Clicar em aplicar
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(cloneDietTemplateToPatient).toHaveBeenCalledWith('1', 'p-123', 'n-123', 'Dieta Hipertrofia');
      expect(getMealPlanById).toHaveBeenCalledWith('new-plan-id');
      expect(mockOnTemplateApplied).toHaveBeenCalledWith({ id: 'new-plan-id', name: 'Dieta Hipertrofia' });
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
