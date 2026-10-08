import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TabContentOverview from './TabContentOverview';

describe('TabContentOverview', () => {
  it('presents actual appointment and check-in states without inventing a duration', () => {
    render(<TabContentOverview operationalContext={{ nextAppointment: { start_time: '2026-10-09T15:00:00Z', status: 'confirmed', appointment_type: 'return' }, latestCheckin: { status: 'expired' } }} onAction={vi.fn()} />);
    expect(screen.getByText('Confirmada')).toBeInTheDocument();
    expect(screen.getByText('Retorno · Duração não informada')).toBeInTheDocument();
    expect(screen.getByText('Expirado')).toBeInTheDocument();
    expect(screen.queryByText(/60 min/)).not.toBeInTheDocument();
    expect(screen.queryByText('confirmed')).not.toBeInTheDocument();
  });

  it('does not call an unrecognized appointment state scheduled', () => {
    render(<TabContentOverview operationalContext={{ nextAppointment: { status: 'new_provider_state' } }} onAction={vi.fn()} />);
    expect(screen.getByText('Status não informado')).toBeInTheDocument();
    expect(screen.queryByText('Agendada')).not.toBeInTheDocument();
  });
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
