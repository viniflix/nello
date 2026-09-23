import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImportMealFromProtocolDialog from './ImportMealFromProtocolDialog';
import { getDietTemplateWithMeals } from '@/lib/supabase/template-queries';

const toast = vi.fn();
const fetchTemplates = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/hooks/useTemplates', () => ({
  useTemplates: () => ({ templates: [{ id: 'template-1', name: 'Protocolo A' }], loading: false, fetchTemplates })
}));
vi.mock('@/lib/supabase/template-queries', () => ({
  getDietTemplateWithMeals: vi.fn(),
  getUnavailableTemplateFoods: (meals = []) => meals.flatMap(meal => (meal.foods || [])
    .filter(item => !item.food || item.food.is_active === false)
    .map(item => ({ meal: meal.name, name: item.food?.name || 'Alimento removido', id: item.food_id, reason: 'indisponível' })))
}));

describe('ImportMealFromProtocolDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDietTemplateWithMeals.mockResolvedValue({ data: { meals: [{ id: 'meal-1', name: 'Almoço', foods: [
      { food_id: 'food-1', food: { name: 'Arroz', is_active: true } }
    ] }] } });
  });

  it('blocks a meal containing a removed food and shows its ID', async () => {
    getDietTemplateWithMeals.mockResolvedValue({ data: { meals: [{ id: 'meal-1', name: 'Almoço', foods: [{ food_id: 'food-1', food: null }] }] } });
    const onImport = vi.fn();
    render(<ImportMealFromProtocolDialog open onOpenChange={vi.fn()} onImport={onImport} />);
    fireEvent.click(screen.getByText('Protocolo A'));
    const button = await screen.findByText('Importar 1 refeição(ões)');
    await waitFor(() => expect(button.disabled).toBe(true));
    expect(screen.getByRole('alert').textContent).toContain('food-1');
    expect(onImport).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and does not show success when saving fails', async () => {
    const onOpenChange = vi.fn();
    const onImport = vi.fn().mockResolvedValue(false);
    render(<ImportMealFromProtocolDialog open onOpenChange={onOpenChange} onImport={onImport} />);
    fireEvent.click(screen.getByText('Protocolo A'));
    const button = await screen.findByText('Importar 1 refeição(ões)');
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Refeições importadas!' }));
  });
});
