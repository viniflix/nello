import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  patient: { patientId: 'patient-a', paramValue: 'ana' },
  useQuery: vi.fn(),
  getFoundation: vi.fn(),
  createRecord: { mutateAsync: vi.fn() },
  templates: [],
  navigate: vi.fn(),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mocks.navigate,
}));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));
vi.mock('@/hooks/useResolvedPatientId', () => ({ useResolvedPatientId: () => mocks.patient }));
vi.mock('@/hooks/useAnamnesisRunner', () => ({ useAnamnesisRunner: () => ({ createRecord: mocks.createRecord }) }));
vi.mock('@/hooks/useAnamnesisTemplates', () => ({ useAnamnesisTemplates: () => ({ useTemplates: () => ({ data: mocks.templates, isLoading: false }) }) }));
vi.mock('@/features/clinical-records/api/record-foundation-queries', () => ({ getPatientRecordFoundation: mocks.getFoundation }));
vi.mock('@/features/clinical-records/components/TimelineFeed', () => ({
  default: ({ patientId, viewedEpisodeId }) => <output data-testid="timeline-context">{patientId}:{viewedEpisodeId}</output>,
}));

import PatientAnamnesePage from './PatientAnamnesePage';

describe('PatientAnamnesePage timeline context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.patient = { patientId: 'patient-a', paramValue: 'ana' };
    mocks.templates = [];
    mocks.useQuery.mockImplementation(({ queryKey }) => ({
      data: queryKey[1] === 'patient-a'
        ? { viewed_episode_id: 'episode-a', writable_episode_id: 'episode-a', can_write: true }
        : { viewed_episode_id: 'episode-b', writable_episode_id: 'episode-b', can_write: true },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));
  });

  it('keys the lightweight foundation lookup by patient and never keeps the prior episode on switch', () => {
    const { rerender } = render(<MemoryRouter><PatientAnamnesePage /></MemoryRouter>);
    expect(mocks.useQuery.mock.calls[0][0].queryKey).toEqual(['patientRecordFoundation', 'patient-a']);
    expect(screen.getByTestId('timeline-context')).toHaveTextContent('patient-a:episode-a');

    mocks.patient = { patientId: 'patient-b', paramValue: 'bia' };
    rerender(<MemoryRouter><PatientAnamnesePage /></MemoryRouter>);
    expect(mocks.useQuery.mock.calls.at(-1)[0].queryKey).toEqual(['patientRecordFoundation', 'patient-b']);
    expect(screen.getByTestId('timeline-context')).toHaveTextContent('patient-b:episode-b');
  });

  it('blocks the retained prior patient context while a new slug resolves or fails', () => {
    const { rerender } = render(<MemoryRouter><PatientAnamnesePage /></MemoryRouter>);
    expect(screen.getByTestId('timeline-context')).toHaveTextContent('patient-a:episode-a');

    mocks.patient = { patientId: 'patient-a', paramValue: 'bia', loading: true, error: null };
    rerender(<MemoryRouter><PatientAnamnesePage /></MemoryRouter>);
    expect(screen.queryByTestId('timeline-context')).not.toBeInTheDocument();

    mocks.patient = { patientId: 'patient-a', paramValue: 'bia', loading: false, error: new Error('resolve failed') };
    rerender(<MemoryRouter><PatientAnamnesePage /></MemoryRouter>);
    expect(screen.queryByTestId('timeline-context')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/não foi possível identificar o paciente/i);
  });

  it('uses the existing record-foundation RPC contract rather than loading the Patient Hub', async () => {
    render(<MemoryRouter><PatientAnamnesePage /></MemoryRouter>);
    const options = mocks.useQuery.mock.calls[0][0];
    mocks.getFoundation.mockResolvedValue({ data: { viewed_episode_id: 'episode-a' }, error: null });
    await expect(options.queryFn()).resolves.toEqual({ viewed_episode_id: 'episode-a' });
    expect(mocks.getFoundation).toHaveBeenCalledWith('patient-a');
  });

  it('preserves anamnesis creation through the existing mutation', async () => {
    mocks.templates = [{ id: 'template-1', title: 'Anamnese inicial' }];
    mocks.createRecord.mutateAsync.mockResolvedValue({ id: 'record-1' });
    render(<MemoryRouter><PatientAnamnesePage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: /nova anamnese/i }));
    fireEvent.click(await screen.findByRole('button', { name: /anamnese inicial/i }));

    await waitFor(() => expect(mocks.createRecord.mutateAsync).toHaveBeenCalledWith({ templateId: 'template-1', episodeId: 'episode-a' }));
  });

  it('disables creation when the displayed episode is read-only', () => {
    mocks.useQuery.mockReturnValue({
      data: { viewed_episode_id: 'episode-ended', writable_episode_id: null, can_write: false },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<MemoryRouter><PatientAnamnesePage /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /nova anamnese/i })).toBeDisabled();
  });

  it('does not navigate from a late create response after the patient context changes', async () => {
    const pending = deferred();
    mocks.templates = [{ id: 'template-1', title: 'Anamnese inicial' }];
    mocks.createRecord.mutateAsync.mockReturnValue(pending.promise);
    const { rerender } = render(<MemoryRouter><PatientAnamnesePage /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /nova anamnese/i }));
    fireEvent.click(await screen.findByRole('button', { name: /anamnese inicial/i }));

    mocks.patient = { patientId: 'patient-b', paramValue: 'bia', loading: false, error: null };
    rerender(<MemoryRouter><PatientAnamnesePage /><Location /></MemoryRouter>);
    await act(async () => {
      pending.resolve({ id: 'record-a' });
      await pending.promise;
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
