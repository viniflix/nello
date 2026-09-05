import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TabContentOverview from './TabContentOverview';

describe('TabContentOverview', () => {
  it('offers a retry, not plan creation, when plan data is unavailable', () => {
    const onAction = vi.fn();
    render(<TabContentOverview operationalContext={{ planStatus: 'unknown', partialErrors: ['planos alimentares'] }} onAction={onAction} />);
    expect(screen.queryByRole('button', { name: 'Iniciar plano' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar plano' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'refresh' });
  });

  it('does not turn unknown meal counts into zero', () => {
    render(<TabContentOverview operationalContext={{ displayedPlan: { id: 1, name: 'Plano' }, planStatus: 'active', mealCount: null, foodCount: null }} onAction={vi.fn()} />);
    expect(screen.queryByText('0 refeições · 0 alimentos')).not.toBeInTheDocument();
  });

  it('keeps history accessible through its explicit action', () => {
    const onAction = vi.fn();
    render(<TabContentOverview onAction={onAction} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver histórico' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'feed' });
  });
});
