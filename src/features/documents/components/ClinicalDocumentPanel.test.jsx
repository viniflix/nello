import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClinicalDocumentPanel from './ClinicalDocumentPanel';
import { listDocumentArtifacts } from '../api/document-queries';
vi.mock('../api/document-queries', () => ({ createDocumentArtifactFromClinicalRecord: vi.fn(), finalizeDocumentArtifact: vi.fn(), getDocumentArtifact: vi.fn(), listDocumentArtifacts: vi.fn(), signDocumentArtifact: vi.fn() }));
vi.mock('../pdf/render-canonical-document', () => ({ downloadCanonicalDocumentPdf: vi.fn() }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
const record = { id: 'one', patient_id: 'patient', care_episode_id: 'episode', status: 'signed', nutritionist_id: 'owner' };
beforeEach(() => { vi.clearAllMocks(); listDocumentArtifacts.mockResolvedValue({ data: [], error: null }); });
afterEach(cleanup);
it('blocks clinical document creation when lookup failed and offers recovery', async () => {
  listDocumentArtifacts.mockResolvedValueOnce({ error: new Error('PRIVATE') });
  render(<ClinicalDocumentPanel record={record} currentUserId="owner" />);
  const retry = await screen.findByRole('button', { name: 'Recarregar' });
  expect(screen.getByRole('button', { name: 'Preparar documento' }).disabled).toBe(true);
  fireEvent.click(retry);
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Preparar documento' }).disabled).toBe(false);
});
it('does not render a late artifact from another clinical record', async () => {
  let complete; listDocumentArtifacts.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const ui = render(<ClinicalDocumentPanel record={record} currentUserId="owner" />);
  ui.rerender(<ClinicalDocumentPanel record={{ ...record, id: 'two' }} currentUserId="owner" />);
  await act(async () => complete({ data: [{ id: 'old', source_type: 'clinical_record', source_id: 'one', status: 'signed' }], error: null }));
  expect(screen.queryByRole('button', { name: 'Baixar PDF oficial' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Preparar documento' }).disabled).toBe(false);
});
it('reports missing episode scope without querying or enabling issuance', async () => {
  render(<ClinicalDocumentPanel record={{ ...record, care_episode_id: null }} currentUserId="owner" />);
  await screen.findByRole('button', { name: 'Recarregar' });
  expect(screen.getByRole('button', { name: 'Preparar documento' }).disabled).toBe(true);
  expect(listDocumentArtifacts).not.toHaveBeenCalled();
});
