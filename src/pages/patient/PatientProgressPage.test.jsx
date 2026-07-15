/* eslint-disable import/first */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  foundation: vi.fn(),
  userId: 'patient-1',
  rows: {
    growth_records: [
      { id: 'weight-1', record_date: '2026-07-10', weight: 75.2, height: 170 },
      { id: 'measurement-newer', record_date: '2026-07-15', height: 171 },
    ],
    glycemia_records: [
      { id: 'glucose-1', date: '2026-07-11T10:00:00Z', value: 96, condition: 'fasting' },
    ],
    progress_photos: [],
  },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/patient/PatientCheckinHistoryWidget', () => ({ default: () => <div>CHECK-INS</div> }));
vi.mock('@/components/anthropometry/WeightChart', () => ({ default: () => <div>GRÁFICO DE PESO</div> }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children, ...props }) => <div {...props}>{children}</div> } }));
vi.mock('@/features/clinical-records/api/record-foundation-queries', () => ({
  getPatientRecordFoundation: mocks.foundation,
}));
vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: {
    from: (table) => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        then: (resolve) => resolve({ data: mocks.rows[table] || [], error: null }),
      };
      return builder;
    },
  },
}));

import PatientProgressPage from './PatientProgressPage';

describe('PatientProgressPage', () => {
  beforeEach(() => {
    mocks.userId = 'patient-1';
    mocks.foundation.mockResolvedValue({
      data: { records: [{
        id: 'clinical-1', record_type: 'follow_up', status: 'signed',
        visibility: 'shared_with_patient', encounter_at: '2026-07-12T10:00:00Z',
      }] },
      error: null,
    });
  });

  it('renders the integrated hub and opens indicator details without losing registration', async () => {
    render(<MemoryRouter><PatientProgressPage /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'MEU PROGRESSO' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'SEUS INDICADORES' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'LINHA DO TEMPO' })).toBeInTheDocument();
    expect(screen.getAllByText('75.2 kg').length).toBeGreaterThan(0);
    expect(screen.getByText('ACOMPANHAMENTO CLÍNICO')).toBeInTheDocument();
    expect(screen.getByText('COMPARTILHADO PELO SEU NUTRICIONISTA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ver registros clínicos/i })).toHaveAttribute('href', '/patient/registros-clinicos');

    fireEvent.click(screen.getByRole('button', { name: /ver detalhes de peso/i }));
    expect(await screen.findByText('GRÁFICO DE PESO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'REGISTRAR PESO' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^adicionar registro$/i })).not.toBeInTheDocument();
  });

  it('does not expose private or draft clinical records in the timeline', async () => {
    mocks.foundation.mockResolvedValueOnce({ data: { records: [
      { id: 'draft', record_type: 'follow_up', status: 'draft', visibility: 'shared_with_patient', encounter_at: '2026-07-14T10:00:00Z' },
      { id: 'private', record_type: 'follow_up', status: 'signed', visibility: 'professional_private', encounter_at: '2026-07-13T10:00:00Z' },
    ] }, error: null });

    render(<MemoryRouter><PatientProgressPage /></MemoryRouter>);
    await waitFor(() => expect(mocks.foundation).toHaveBeenCalledWith('patient-1'));
    expect(screen.queryByText('ACOMPANHAMENTO CLÍNICO')).not.toBeInTheDocument();
  });

  it('ignores a stale load when the authenticated patient changes', async () => {
    let resolveOld;
    const oldFoundation = new Promise((resolve) => { resolveOld = resolve; });
    mocks.foundation
      .mockReturnValueOnce(oldFoundation)
      .mockResolvedValueOnce({
        data: { records: [{
          id: 'new-patient-record', record_type: 'follow_up', status: 'signed',
          visibility: 'shared_with_patient', encounter_at: '2026-07-14T10:00:00Z',
        }] },
        error: null,
      });

    const view = render(<MemoryRouter><PatientProgressPage /></MemoryRouter>);
    mocks.userId = 'patient-2';
    view.rerender(<MemoryRouter><PatientProgressPage /></MemoryRouter>);

    await waitFor(() => expect(mocks.foundation).toHaveBeenCalledWith('patient-2'));
    await act(async () => {
      resolveOld({
        data: { records: [{
          id: 'old-patient-record', record_type: 'initial_assessment', status: 'signed',
          visibility: 'shared_with_patient', encounter_at: '2026-07-15T10:00:00Z',
        }] },
        error: null,
      });
    });

    expect(await screen.findByText('ACOMPANHAMENTO CLÍNICO')).toBeInTheDocument();
    expect(screen.queryByText('Avaliação inicial')).not.toBeInTheDocument();
  });
});
