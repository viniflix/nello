/* eslint-disable import/first */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFoundation: vi.fn(),
  listChain: vi.fn(),
  userId: 'patient-1',
  requestedRecordId: null,
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: mocks.userId } }) }));
vi.mock('@/features/clinical-records/api/record-foundation-queries', () => ({
  getPatientRecordFoundation: mocks.getFoundation,
}));
vi.mock('@/features/clinical-records/api/amendment-queries', () => ({
  listClinicalRecordVersionChain: mocks.listChain,
}));
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(mocks.requestedRecordId ? { record: mocks.requestedRecordId } : {})],
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
  professional_display_name: 'Dra. Ana Souza',
  amendment: {
    type: 'correction', status: 'effective', reason: 'Ajuste de informação registrada.',
    effective_at: '2026-07-15T13:00:00Z', responsible_id: 'technical-professional-id',
  },
  canonical_hash: 'secret-hash',
};

describe('PatientClinicalRecordsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userId = 'patient-1';
    mocks.requestedRecordId = null;
    mocks.getFoundation.mockResolvedValue({ data: { records: [currentRecord] }, error: null });
    mocks.listChain.mockResolvedValue({
      data: [
        currentRecord,
        {
          ...currentRecord,
          id: 'record-root', chain_version: 1, status: 'corrected',
          content: { evolution: 'Versão anterior.' }, amendment: currentRecord.amendment,
        },
        { ...currentRecord, id: 'draft-record', status: 'draft', chain_version: 3 },
        { ...currentRecord, id: 'finalized-record', status: 'finalized', chain_version: 4 },
        { ...currentRecord, id: 'abandoned-record', status: 'invalidated', chain_version: 5, amendment: { type: 'correction', status: 'abandoned' } },
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

    expect(await screen.findByRole('heading', { name: 'REGISTROS CLÍNICOS' })).toBeInTheDocument();
    expect(screen.getByText('CONTEÚDOS COMPARTILHADOS PELO SEU NUTRICIONISTA')).toBeInTheDocument();
    expect(screen.queryByText(/equipe do cuidado/i)).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /abrir evolução clínica/i }));

    await waitFor(() => expect(mocks.listChain).toHaveBeenCalledWith('record-current'));
    expect(screen.getByText('Versão atual')).toBeInTheDocument();
    expect(screen.getByText('Histórico de versões')).toBeInTheDocument();
    expect(screen.getByText('Substituído')).toBeInTheDocument();
    expect(screen.getAllByText('Ajuste de informação registrada.')).not.toHaveLength(0);
    expect(screen.getAllByText('Dra. Ana Souza')).not.toHaveLength(0);
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

  it('accepts only official shared states as defense in depth', async () => {
    mocks.getFoundation.mockResolvedValueOnce({ data: { records: [
      currentRecord,
      { ...currentRecord, id: 'draft', root_record_id: 'draft', status: 'draft' },
      { ...currentRecord, id: 'finalized', root_record_id: 'finalized', status: 'finalized' },
      { ...currentRecord, id: 'bad-corrected', root_record_id: 'bad-corrected', status: 'corrected', amendment: { type: 'correction', status: 'draft' } },
      { ...currentRecord, id: 'bad-invalidated', root_record_id: 'bad-invalidated', status: 'invalidated', amendment: { type: 'correction', status: 'abandoned' } },
      { ...currentRecord, id: 'effective-corrected', root_record_id: 'effective-corrected', status: 'corrected', amendment: { type: 'correction', status: 'effective', reason: 'Correção oficial.' } },
      { ...currentRecord, id: 'effective-invalidated', root_record_id: 'effective-invalidated', status: 'invalidated', amendment: { type: 'invalidation', status: 'effective', reason: 'Invalidação oficial.' } },
    ] }, error: null });

    render(<PatientClinicalRecordsPage />);
    expect(await screen.findAllByRole('button', { name: /abrir evolução clínica/i })).toHaveLength(3);
  });

  it('ignores stale chain responses when the patient rapidly opens A then B', async () => {
    let resolveA;
    const chainA = new Promise((resolve) => { resolveA = resolve; });
    const recordB = { ...currentRecord, id: 'record-b', root_record_id: 'record-b', encounter_at: '2026-07-14T12:00:00Z', content: { evolution: 'Conteúdo vigente B.' } };
    mocks.getFoundation.mockResolvedValueOnce({ data: { records: [currentRecord, recordB] }, error: null });
    mocks.listChain
      .mockReturnValueOnce(chainA)
      .mockResolvedValueOnce({ data: [recordB], error: null });
    render(<PatientClinicalRecordsPage />);
    const actions = await screen.findAllByRole('button', { name: /abrir evolução clínica/i });
    fireEvent.click(actions[0]);
    fireEvent.click(actions[1]);
    expect(await screen.findByText('Conteúdo vigente B.')).toBeInTheDocument();
    await act(async () => resolveA({ data: [currentRecord], error: null }));
    expect(screen.getByText('Conteúdo vigente B.')).toBeInTheDocument();
    expect(screen.queryByText('Evolução revisada e compartilhada.')).not.toBeInTheDocument();
  });

  it('ignores an old user request and does not continue after unmount', async () => {
    let resolveOld;
    const oldRequest = new Promise((resolve) => { resolveOld = resolve; });
    mocks.getFoundation
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValueOnce({ data: { records: [{ ...currentRecord, id: 'patient-2-record', record_type: 'follow_up' }] }, error: null });
    const view = render(<PatientClinicalRecordsPage />);
    mocks.userId = 'patient-2';
    view.rerender(<PatientClinicalRecordsPage />);
    expect(await screen.findByRole('button', { name: /abrir acompanhamento clínico/i })).toBeInTheDocument();
    await act(async () => resolveOld({ data: { records: [{ ...currentRecord, id: 'stale-record', record_type: 'initial_assessment' }] }, error: null }));
    expect(screen.queryByRole('button', { name: /abrir avaliação inicial/i })).not.toBeInTheDocument();
    view.unmount();
  });

  it('explains an effective invalidation without erasing the historical record', async () => {
    const invalidated = {
      ...currentRecord,
      status: 'invalidated',
      amendment: { type: 'invalidation', status: 'effective', reason: 'Inconsistência confirmada.', effective_at: '2026-07-15T13:00:00Z' },
    };
    mocks.getFoundation.mockResolvedValueOnce({ data: { records: [invalidated] }, error: null });
    mocks.listChain.mockResolvedValueOnce({ data: [invalidated], error: null });
    render(<PatientClinicalRecordsPage />);
    fireEvent.click(await screen.findByRole('button', { name: /abrir evolução clínica/i }));
    expect(await screen.findByText(/invalidado pelo profissional responsável/i)).toBeInTheDocument();
    expect(screen.getByText(/permanece preservado no histórico/i)).toBeInTheDocument();
    expect(screen.getByText(/não representa uma orientação clínica vigente/i)).toBeInTheDocument();
  });

  it('opens a specific safe record linked from the progress timeline', async () => {
    mocks.requestedRecordId = 'record-current';
    render(<PatientClinicalRecordsPage />);

    await waitFor(() => expect(mocks.listChain).toHaveBeenCalledWith('record-current'));
    expect(await screen.findByText('Evolução revisada e compartilhada.')).toBeInTheDocument();
  });
});
