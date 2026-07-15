/* eslint-disable import/first */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ logSupabaseError: vi.fn() }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: mocks.logSupabaseError }));

import TimelineItem from './TimelineItem';

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

const baseItem = {
  event_id: 'meal_plan:plan-1', source_id: 'plan-1', source_type: 'meal_plan',
  category: 'operational', subtype: 'meal_plan', title: 'Plano alimentar publicado',
  summary: 'Plano disponível.', occurred_at: '2026-07-14T12:30:00Z', status: 'published', is_legacy: false,
};

describe('TimelineItem', () => {
  it('opens the exact meal-plan summary route with keyboard-accessible semantics', () => {
    render(<MemoryRouter><TimelineItem item={baseItem} patientSlug="ana" /><Location /></MemoryRouter>);
    const action = screen.getByRole('button', { name: /ver detalhes de plano alimentar publicado/i });
    fireEvent.click(action);
    expect(screen.getByTestId('location')).toHaveTextContent('/nutritionist/patients/ana/meal-plan/plan-1/summary');
  });

  it('renders an invalid date safely and logs only minimized identifiers', () => {
    render(<MemoryRouter><TimelineItem item={{ ...baseItem, occurred_at: 'not-a-date' }} patientSlug="ana" /></MemoryRouter>);
    expect(screen.getByText('Data não informada')).toBeInTheDocument();
    expect(mocks.logSupabaseError).toHaveBeenCalledWith(
      'Data inválida na linha do tempo',
      expect.objectContaining({ message: 'timeline_invalid_date', eventId: baseItem.event_id, sourceType: 'meal_plan' }),
    );
    expect(JSON.stringify(mocks.logSupabaseError.mock.calls)).not.toContain(baseItem.summary);
  });

  it('never renders raw fields or public access tokens', () => {
    render(<MemoryRouter><TimelineItem item={{ ...baseItem, raw: { public_access_token: 'secret-token' } }} patientSlug="ana" /></MemoryRouter>);
    expect(screen.queryByText(/secret-token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copiar link/i })).not.toBeInTheDocument();
  });

  it('translates known statuses and uses a safe label for unknown database values', () => {
    const { rerender } = render(<MemoryRouter><TimelineItem item={{ ...baseItem, status: 'no_show' }} patientSlug="ana" /></MemoryRouter>);
    expect(screen.getByText('Ausência')).toBeInTheDocument();
    rerender(<MemoryRouter><TimelineItem item={{ ...baseItem, status: 'confirmed' }} patientSlug="ana" /></MemoryRouter>);
    expect(screen.getByText('Confirmado')).toBeInTheDocument();
    rerender(<MemoryRouter><TimelineItem item={{ ...baseItem, status: 'future_internal_value' }} patientSlug="ana" /></MemoryRouter>);
    expect(screen.getByText('Registrado')).toBeInTheDocument();
    expect(screen.queryByText('future_internal_value')).not.toBeInTheDocument();
  });

  it('presents amendments neutrally without leaking technical metadata', () => {
    render(<MemoryRouter><TimelineItem item={{
      ...baseItem,
      source_type: 'clinical_record',
      status: 'invalidated',
      title: 'Internal title must not win',
      summary: 'Internal summary must not win',
      raw: { reason: 'private reason', canonical_hash: 'secret-hash', responsible_id: 'technical-id' },
    }} patientSlug="ana" /></MemoryRouter>);

    expect(screen.getByText('Registro clínico invalidado')).toBeInTheDocument();
    expect(screen.getByText(/este registro não deve mais ser considerado/i)).toBeInTheDocument();
    expect(screen.queryByText(/internal|private reason|secret-hash|technical-id/i)).not.toBeInTheDocument();
  });
});
