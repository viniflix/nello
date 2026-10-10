import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import CascadeMeasureSelector from './CascadeMeasureSelector';

const state = vi.hoisted(() => ({ allLoading: false, foodLoading: false }));
vi.mock('@/hooks/useHouseholdMeasures', () => ({ useAllMeasures: () => ({ data: [], isLoading: state.allLoading }) }));
vi.mock('@/hooks/useFoodMeasures', () => ({ useFoodMeasures: () => ({ data: [], isLoading: state.foodLoading }) }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ calculateNutrition: vi.fn() }));
afterEach(cleanup);

describe('cascade loading from both measure sources', () => {
  it.each([[false, false], [true, false], [false, true], [true, true]])('renders while system=%s and food=%s are loading', (allLoading, foodLoading) => {
    Object.assign(state, { allLoading, foodLoading });
    render(<CascadeMeasureSelector food={{ id: 'synthetic-food' }} quantity="" unit="" onUnitChange={vi.fn()} onQuantityChange={vi.fn()} />);
    const [category, measure] = screen.getAllByRole('combobox');
    expect(category.disabled).toBe(allLoading || foodLoading);
    expect(measure).toBeDisabled();
    if (allLoading || foodLoading) expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });
});
