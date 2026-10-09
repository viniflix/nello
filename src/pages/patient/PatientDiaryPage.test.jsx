import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PatientDiaryPage from './PatientDiaryPage';

const mocks = vi.hoisted(() => ({
  plan: vi.fn(), toast: vi.fn(),
  user: { id: 'synthetic-patient' },
  meals: [{ id: 'synthetic-meal', meal_type: 'lunch', total_calories: 250, total_protein: 12, total_carbs: 30, total_fat: 8, meal_items: [] }],
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ unreadCount: 0 }) }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getActiveMealPlan: mocks.plan }));
vi.mock('@/lib/supabase/food-diary-queries', () => ({
  getPatientReminderPreferences: async () => ({ data: null }), upsertPatientReminderPreferences: vi.fn(),
}));
vi.mock('@/components/patient/MealPlanViewDialog', () => ({ default: () => null }));
vi.mock('@/components/NotificationsPanel', () => ({ default: () => null }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: () => {
  const builder = { select: () => builder, eq: () => builder, is: () => builder, order: () => builder,
    then: resolve => resolve({ data: mocks.meals, error: null }) };
  return builder;
} } }));

async function summary() {
  render(<MemoryRouter><PatientDiaryPage /></MemoryRouter>);
  return within((await screen.findByText('Progresso do Dia')).closest('[data-slot="card"]') || screen.getByText('Progresso do Dia').parentElement.parentElement);
}
describe('patient diary prescribed targets', () => {
  beforeEach(() => mocks.plan.mockResolvedValue({ data: null, error: null }));
  it('keeps logged consumption without inventing a clinical target for a patient without a plan', async () => {
    const card = await summary();
    expect(card.getByText('250 kcal')).toBeInTheDocument();
    expect(card.getAllByText('Meta não definida')).toHaveLength(4);
    expect(card.queryByText(/2000|2\.000/)).not.toBeInTheDocument();
    expect(card.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registrar Outra Refeição' })).toBeInTheDocument();
  });
  it('keeps applied targets and distinguishes a missing macro from a measured zero', async () => {
    mocks.plan.mockResolvedValue({ data: { daily_calories: 1800, daily_protein: null, daily_carbs: 200, daily_fat: 0, meal_plan_meals: [] }, error: null });
    const card = await summary();
    expect(card.getByText('250 / 1800 kcal')).toBeInTheDocument();
    expect(card.getByText('12 g')).toBeInTheDocument();
    expect(card.getAllByText('Meta não definida')).toHaveLength(1);
    expect(card.getByText('8 / 0 g')).toBeInTheDocument();
    expect(card.getAllByRole('progressbar')).toHaveLength(2);
  });
  it('preserves known macro targets even when the plan has no energy target', async () => {
    mocks.plan.mockResolvedValue({ data: { daily_calories: null, daily_protein: 80, daily_carbs: null, daily_fat: null, meal_plan_meals: [] }, error: null });
    const card = await summary();
    expect(card.getByText('12 / 80 g')).toBeInTheDocument();
    expect(card.getByText('250 kcal')).toBeInTheDocument();
    expect(card.getAllByText('Meta não definida')).toHaveLength(3);
    expect(card.getAllByRole('progressbar')).toHaveLength(1);
  });
});
