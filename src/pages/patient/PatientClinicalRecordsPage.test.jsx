/* eslint-disable import/first */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFoundation: vi.fn(),
  listChain: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'patient-1' } }) }));
vi.mock('@/features/clinical-records/api/record-foundation-queries', () => ({
  getPatientRecordFoundation: mocks.getFoundation,
}));
vi.mock('@/features/clinical-records/api/amendment-queries', () => ({
  listClinicalRecordVersionChain: mocks.listChain,
}));

import PatientClinicalRecordsPage from './PatientClinicalRecordsPage';

const currentRecord = {
  id: 'record-current',
  root_record_id: 'record-root',
  record_type: 'clinical_evolution',
  status: 'signed',
  visibility: 'shared_with_patient',
  encounter_at: '2026-07-15T12:00:00Z',
  chain_version: 2,
  content: { evolution: 'Evolução revisada e compartilhada.' },
  amendment: {
    type: 'correction', status: 'effective', reason: 'Ajuste de informação registrada.',
    effective_at: '2026-07-15T13:00:00Z', responsible_id: 'technical-professional-id',
  },
  canonical_hash: 'secret-hash',
};

describe('PatientClinicalRecordsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFoundation.mockResolvedValue({ data: { records: [currentRecord] }, error: null });
    mocks.listChain.mockResolvedValue({
      data: [
        currentRecord,
        {
          ...currentRecord,
          id: 'record-root', chain_version: 1, status: 'corrected',
          content: { evolution: 'Versão anterior.' }, amendment: currentRecord.amendment,
        },
        {
          ...currentRecord, id: 'private-record', visibility: 'professional_private',
          content: { evolution: 'Conteúdo privado proibido.' },
        },
      ],
      error: null,
    });
  });

  it('shows the current shared version first and a labeled, safe history', async () => {
    render(<PatientClinicalRecordsPage />);

    expect(await screen.findByRole('heading', { name: 'Registros clínicos' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /abrir evolução clínica/i }));

    await waitFor(() => expect(mocks.listChain).toHaveBeenCalledWith('record-current'));
    expect(screen.getByText('Versão atual')).toBeInTheDocument();
    expect(screen.getByText('Histórico de versões')).toBeInTheDocument();
    expect(screen.getByText('Substituído')).toBeInTheDocument();
    expect(screen.getAllByText('Ajuste de informação registrada.')).not.toHaveLength(0);
    expect(screen.getAllByText(/profissional responsável pelo atendimento/i)).not.toHaveLength(0);
    expect(screen.queryByText(/secret-hash|technical-professional-id|conteúdo privado proibido/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /corrigir|invalidar|assinar|editar/i })).not.toBeInTheDocument();
  });

  it('does not list non-shared records and supports empty and recoverable error states', async () => {
    mocks.getFoundation.mockResolvedValueOnce({
      data: { records: [{ ...currentRecord, visibility: 'share_later' }] }, error: null,
    });
    const { rerender } = render(<PatientClinicalRecordsPage />);
    expect(await screen.findByText('Nenhum registro clínico compartilhado até agora.')).toBeInTheDocument();

    mocks.getFoundation.mockResolvedValueOnce({ data: null, error: new Error('unavailable') });
    rerender(<PatientClinicalRecordsPage key="error" />);
    expect(await screen.findByText('Não foi possível carregar seus registros clínicos.')).toBeInTheDocument();
    mocks.getFoundation.mockResolvedValueOnce({ data: { records: [currentRecord] }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('button', { name: /abrir evolução clínica/i })).toBeInTheDocument();
  });
});
