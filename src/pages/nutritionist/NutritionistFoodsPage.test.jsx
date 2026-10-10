import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NutritionistFoodsPage from './NutritionistFoodsPage';

const fixture = vi.hoisted(() => ({ user: null, from: vi.fn(), navigate: vi.fn(), toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fixture.user }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => fixture.navigate }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: fixture.toast }) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { from: fixture.from } }));
vi.mock('@/components/nutritionist/FoodMeasureManager', () => ({ default: () => null }));
vi.mock('@/components/nutrition/SmartFoodForm', () => ({ default: () => null }));

describe('legacy foods session transition', () => {
  it('keeps hooks stable and mounts queries only while administrator access exists', async () => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
    fixture.user = null;
    fixture.from.mockClear();
    fixture.from.mockImplementation(() => {
      const query = { select: () => query, eq: () => query, then: resolve => Promise.resolve({ count: 0 }).then(resolve) };
      return query;
    });
    const { rerender } = render(<NutritionistFoodsPage />);
    expect(screen.getByRole('heading', { name: 'Acesso Negado' })).toBeInTheDocument();
    expect(fixture.from).not.toHaveBeenCalled();
    fixture.user = { profile: { is_admin: true } };
    expect(() => rerender(<NutritionistFoodsPage />)).not.toThrow();
    await waitFor(() => expect(fixture.from).toHaveBeenCalledTimes(2));
    fixture.user = { profile: { is_admin: false } };
    expect(() => rerender(<NutritionistFoodsPage />)).not.toThrow();
    expect(screen.getByRole('heading', { name: 'Acesso Negado' })).toBeInTheDocument();
    expect(fixture.from).toHaveBeenCalledTimes(2);
    expect(fixture.navigate).toHaveBeenCalledWith('/nutritionist', { replace: true });
    vi.unstubAllGlobals();
  });
});
