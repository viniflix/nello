import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TabContentClinical from './TabContentClinical';
import ClinicalRecordsList from '@/features/clinical-records/components/ClinicalRecordsList';
import * as evolutionQueries from '@/features/clinical-records/api/evolution-queries';

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/supabase/anamnesis-queries', () => ({
  getLatestAnamnesis: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock('@/lib/supabase/lab-results-queries', () => ({
  getRecentLabResults: vi.fn().mockResolvedValue({ data: [] }),
}));
vi.mock('@/components/patient-hub/GlycemiaSummaryCard', () => ({ default: () => null }));
vi.mock('@/features/clinical-records/components/EvolutionEditor', () => ({
  default: ({ initialRecord, onReplacementOpen, onRecordsRefresh }) => (
    <div>
      Editor {initialRecord.id}
      <button type="button" onClick={() => onReplacementOpen?.({ id: 'replacement-2', status: 'draft' })}>
        abrir substituição
      </button>
      <button type="button" onClick={() => onRecordsRefresh?.()}>recarregar registros</button>
    </div>
  ),
}));
vi.mock('@/features/clinical-records/components/EvolutionTemplateSelector', () => ({
  default: ({ open, onSelectTemplate }) => open ? (
    <button type="button" onClick={() => onSelectTemplate({
      template: { code: 'soap' },
      encounterAt: '2026-07-14T12:00:00.000Z',
      visibility: 'share_later',
      retrospectiveReason: 'Registro realizado posteriormente',
    })}>
      confirmar template
    </button>
  ) : null,
}));
vi.mock('@/features/clinical-records/api/evolution-queries', () => ({
  createClinicalEvolutionDraft: vi.fn(),
  listClinicalRecordsByEpisode: vi.fn(),
}));

const deferred = () => {
  let resolve;
  const promise = new Promise((resolver) => { resolve = resolver; });
  return { promise, resolve };
};

const props = {
  patientId: 'patient-a',
  patientData: { id: 'patient-a', name: 'Ana' },
  viewedEpisodeId: 'episode-a',
  writableEpisodeId: 'episode-a',
  currentUserId: 'user-1',
};

describe('TabContentClinical C2 flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evolutionQueries.listClinicalRecordsByEpisode.mockResolvedValue({ data: [], error: null });
  });

  it('creates a draft atomically with patient, writable episode and creation metadata', async () => {
    evolutionQueries.createClinicalEvolutionDraft.mockResolvedValue({
      data: { id: 'record-1', status: 'draft' },
      error: null,
    });
    render(<TabContentClinical {...props} />);

    fireEvent.click(await screen.findByRole('button', { name: /nova evolu/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar template/i }));

    await waitFor(() => expect(evolutionQueries.createClinicalEvolutionDraft).toHaveBeenCalledWith(
      'patient-a',
      'episode-a',
      'soap',
      '2026-07-14T12:00:00.000Z',
      'share_later',
      'Registro realizado posteriormente',
    ));
    expect(await screen.findByText('Editor record-1')).toBeInTheDocument();
  });

  it('ignores a draft creation response after switching patient and episode', async () => {
    const pendingCreation = deferred();
    evolutionQueries.createClinicalEvolutionDraft.mockReturnValue(pendingCreation.promise);
    const { rerender } = render(<TabContentClinical {...props} />);

    fireEvent.click(await screen.findByRole('button', { name: /nova evolu/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar template/i }));
    rerender(<TabContentClinical
      {...props}
      patientId="patient-b"
      patientData={{ id: 'patient-b', name: 'Bia' }}
      viewedEpisodeId="episode-b"
      writableEpisodeId="episode-b"
    />);
    await act(async () => {
      pendingCreation.resolve({ data: { id: 'record-a', status: 'draft' }, error: null });
      await pendingCreation.promise;
    });

    expect(screen.queryByText('Editor record-a')).not.toBeInTheDocument();
  });

  it('clears records on patient switch and ignores the stale response', async () => {
    const responseA = deferred();
    const responseB = deferred();
    evolutionQueries.listClinicalRecordsByEpisode
      .mockReturnValueOnce(responseA.promise)
      .mockReturnValueOnce(responseB.promise);
    const { rerender } = render(<TabContentClinical {...props} />);

    rerender(<TabContentClinical
      {...props}
      patientId="patient-b"
      patientData={{ id: 'patient-b', name: 'Bia' }}
      viewedEpisodeId="episode-b"
      writableEpisodeId="episode-b"
    />);
    responseB.resolve({ data: [{ id: 'record-b', record_type: 'record-b', status: 'draft', encounter_at: '2026-07-14T12:00:00Z' }], error: null });
    expect(await screen.findByText(/record-b/i)).toBeInTheDocument();

    responseA.resolve({ data: [{ id: 'record-a', record_type: 'record-a', status: 'draft', encounter_at: '2026-07-14T12:00:00Z' }], error: null });
    await waitFor(() => expect(screen.queryByText(/record-a/i)).not.toBeInTheDocument());
    expect(screen.getByText(/record-b/i)).toBeInTheDocument();
  });

  it('shows a list error and retries the current patient and episode', async () => {
    evolutionQueries.listClinicalRecordsByEpisode
      .mockResolvedValueOnce({ data: null, error: { message: 'rede indisponivel' } })
      .mockResolvedValueOnce({ data: [], error: null });
    render(<TabContentClinical {...props} />);

    expect(await screen.findByText(/n.o foi poss.vel carregar as evolu/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));

    await waitFor(() => expect(evolutionQueries.listClinicalRecordsByEpisode).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/n.o foi poss.vel carregar as evolu/i)).not.toBeInTheDocument();
  });

  it('opens a correction replacement immediately and preserves a selected record through refresh', async () => {
    evolutionQueries.listClinicalRecordsByEpisode
      .mockResolvedValueOnce({
        data: [{ id: 'signed-1', root_record_id: 'root-1', chain_version: 1, status: 'signed', record_type: 'clinical_evolution', encounter_at: '2026-07-14T12:00:00Z' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'signed-1', root_record_id: 'root-1', chain_version: 1, status: 'signed', record_type: 'refreshed_record', encounter_at: '2026-07-14T12:00:00Z' }],
        error: null,
      });
    render(<TabContentClinical {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: /abrir evolu/i }));
    expect(await screen.findByText('Editor signed-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /recarregar registros/i }));
    await waitFor(() => expect(evolutionQueries.listClinicalRecordsByEpisode).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Editor signed-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /abrir substitui/i }));
    expect(await screen.findByText('Editor replacement-2')).toBeInTheDocument();
  });

  it('does not offer a new evolution for an ended viewed episode while signed records remain openable', async () => {
    evolutionQueries.listClinicalRecordsByEpisode.mockResolvedValue({
      data: [{ id: 'signed-ended', status: 'signed', record_type: 'clinical_evolution', encounter_at: '2026-07-14T12:00:00Z' }],
      error: null,
    });
    render(<TabContentClinical {...props} writableEpisodeId={null} />);

    expect(await screen.findByRole('button', { name: /abrir evolu/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nova evolu/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /abrir evolu/i }));
    expect(await screen.findByText('Editor signed-ended')).toBeInTheDocument();
  });
});

describe('ClinicalRecordsList accessibility', () => {
  it('opens a record through a semantic keyboard-operable button', () => {
    const onSelectRecord = vi.fn();
    render(<ClinicalRecordsList
      records={[{
        id: 'record-keyboard',
        status: 'draft',
        record_type: 'clinical_evolution',
        encounter_at: '2026-07-14T12:00:00Z',
      }]}
      onSelectRecord={onSelectRecord}
      canWriteEpisode={false}
    />);

    const recordButton = screen.getByRole('button', { name: /abrir evolu.*14\/07\/2026/i });
    expect(screen.getByRole('searchbox', { name: /buscar registros cl.nicos/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /filtrar por status/i })).toBeInTheDocument();
    recordButton.focus();
    fireEvent.keyDown(recordButton, { key: 'Enter' });
    fireEvent.click(recordButton);
    expect(onSelectRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'record-keyboard' }));
  });

  it('shows one current row per root and keeps historical versions collapsed in descending order', () => {
    render(<ClinicalRecordsList
      records={[
        { id: 'v1', root_record_id: 'root-1', chain_version: 1, status: 'corrected', record_type: 'clinical_evolution', encounter_at: '2026-07-12T12:00:00Z' },
        { id: 'v3', root_record_id: 'root-1', chain_version: 3, status: 'draft', record_type: 'clinical_evolution', encounter_at: '2026-07-14T12:00:00Z' },
        { id: 'v2', root_record_id: 'root-1', chain_version: 2, status: 'signed', record_type: 'clinical_evolution', encounter_at: '2026-07-13T12:00:00Z' },
      ]}
      onSelectRecord={vi.fn()}
      canWriteEpisode={false}
    />);

    expect(screen.getByRole('button', { name: /abrir evolu.*13\/07\/2026/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abrir evolu.*14\/07\/2026/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /mostrar 2 vers.es anteriores/i }));
    const historical = screen.getAllByTestId('historical-record-row');
    expect(historical.map((row) => row.dataset.recordId)).toEqual(['v3', 'v1']);
  });

  it('filters whole chains without promoting the matching historical version over the current record', () => {
    render(<ClinicalRecordsList
      records={[
        { id: 'historic', root_record_id: 'root-1', chain_version: 1, status: 'corrected', record_type: 'historic_match', encounter_at: '2026-07-12T12:00:00Z' },
        { id: 'current', root_record_id: 'root-1', chain_version: 2, status: 'signed', record_type: 'clinical_evolution', encounter_at: '2026-07-13T12:00:00Z' },
      ]}
      onSelectRecord={vi.fn()}
      canWriteEpisode={false}
    />);

    fireEvent.change(screen.getByRole('searchbox', { name: /buscar registros cl.nicos/i }), {
      target: { value: 'historic_match' },
    });
    expect(screen.getByRole('button', { name: /abrir evolu.*13\/07\/2026/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /abrir evolu.*12\/07\/2026/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mostrar 1 vers.o anterior/i })).toBeInTheDocument();
  });

  it('labels an abandoned replacement exactly as Rascunho abandonado', () => {
    render(<ClinicalRecordsList
      records={[
        { id: 'signed-v1', root_record_id: 'root-1', chain_version: 1, status: 'signed', record_type: 'clinical_evolution', encounter_at: '2026-07-13T12:00:00Z' },
        { id: 'abandoned-v2', root_record_id: 'root-1', chain_version: 2, status: 'invalidated', amendment_status: 'abandoned', record_type: 'clinical_evolution', encounter_at: '2026-07-14T12:00:00Z' },
      ]}
      onSelectRecord={vi.fn()}
      canWriteEpisode={false}
    />);

    fireEvent.click(screen.getByRole('button', { name: /mostrar 1 vers.o anterior/i }));
    const historicalRow = screen.getByTestId('historical-record-row');
    expect(within(historicalRow).getByText('Rascunho abandonado')).toBeInTheDocument();
    expect(within(historicalRow).queryByText('Invalidado')).not.toBeInTheDocument();
  });
});
