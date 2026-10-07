import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MealPlanDocumentActions from './MealPlanDocumentActions';
import { createDocumentArtifactFromMealPlan, finalizeDocumentArtifact, getDocumentArtifact, listDocumentArtifacts, signDocumentArtifact } from '../api/document-queries';
import { downloadCanonicalDocumentPdf } from '../pdf/render-canonical-document';

vi.mock('../api/document-queries', () => ({
  createDocumentArtifactFromMealPlan: vi.fn(), finalizeDocumentArtifact: vi.fn(),
  getDocumentArtifact: vi.fn(), listDocumentArtifacts: vi.fn(), signDocumentArtifact: vi.fn(),
}));
vi.mock('../pdf/render-canonical-document', () => ({ downloadCanonicalDocumentPdf: vi.fn() }));
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
const plan = { id: 1, care_episode_id: 'episode', is_draft: false };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
beforeEach(() => { vi.clearAllMocks(); listDocumentArtifacts.mockResolvedValue({ data: [], error: null }); });
afterEach(cleanup);

it('does not prepare while the existing-document lookup is pending', async () => {
  const pending = deferred(); listDocumentArtifacts.mockReturnValue(pending.promise);
  render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  expect(screen.queryByRole('button', { name: 'Preparar' })?.disabled ?? true).toBe(true);
  expect(createDocumentArtifactFromMealPlan).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ data: [], error: null }));
  expect(screen.getByRole('button', { name: 'Preparar' }).disabled).toBe(false);
});

it('prevents duplicate mutations while preserving the visible panel', async () => {
  const pending = deferred(); createDocumentArtifactFromMealPlan.mockReturnValue(pending.promise);
  render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  await waitFor(() => expect(listDocumentArtifacts).toHaveBeenCalled());
  const button = await screen.findByRole('button', { name: 'Preparar' });
  fireEvent.click(button); fireEvent.click(button);
  expect(createDocumentArtifactFromMealPlan).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(true);
  await act(async () => pending.resolve({ data: { artifact_id: 'document' }, error: null }));
});

it('discards late documents from a different plan', async () => {
  const old = deferred(); listDocumentArtifacts.mockReturnValueOnce(old.promise).mockResolvedValue({ data: [], error: null });
  const ui = render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  ui.rerender(<MealPlanDocumentActions plan={{ ...plan, id: 2 }} patientId="patient" />);
  await screen.findByRole('button', { name: 'Preparar' });
  await act(async () => old.resolve({ data: [{ id: 'old', source_type: 'meal_plan', source_key: '1', status: 'signed' }], error: null }));
  expect(screen.queryByRole('button', { name: 'PDF oficial' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Preparar' }).disabled).toBe(false);
});

it('offers safe retry after a lookup failure without enabling creation', async () => {
  listDocumentArtifacts.mockResolvedValueOnce({ data: null, error: { message: 'PRIVATE_SENTINEL' } });
  render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  const retry = await screen.findByRole('button', { name: 'Tentar novamente' });
  expect(screen.queryByRole('button', { name: 'Preparar' })).toBeNull();
  expect(document.body.textContent).not.toContain('PRIVATE_SENTINEL');
  fireEvent.click(retry);
  await screen.findByRole('button', { name: 'Preparar' });
});

it('explains the missing responsible identity and releases pending state after a rejected mutation', async () => {
  createDocumentArtifactFromMealPlan.mockRejectedValue({ code: '23514', message: 'responsible_document_identity_required' });
  render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar' }));
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('profissional responsável') })));
  expect(screen.getByRole('button', { name: 'Preparar' }).disabled).toBe(false);
  expect(screen.getByRole('link', { name: 'Configurar identidade documental' }).getAttribute('href')).toBe('/nutritionist/profile?tab=documents');
});

it('does not query or emit documents for draft plans', () => {
  render(<MealPlanDocumentActions plan={{ ...plan, is_draft: true }} patientId="patient" />);
  expect(screen.queryByRole('button', { name: 'Preparar' })).toBeNull();
  expect(listDocumentArtifacts).not.toHaveBeenCalled();
});

it('recovers an existing document after another session wins creation', async () => {
  createDocumentArtifactFromMealPlan.mockResolvedValue({ error: { code: '23505', message: 'meal_plan_document_already_exists' } });
  render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar' }));
  const refresh = await screen.findByRole('button', { name: 'Atualizar documentos' });
  listDocumentArtifacts.mockResolvedValue({ data: [{ id: 'winner', source_type: 'meal_plan', source_key: '1', status: 'draft' }], error: null });
  fireEvent.click(refresh); await screen.findByRole('button', { name: 'Finalizar' });
  expect(createDocumentArtifactFromMealPlan).toHaveBeenCalledTimes(1);
});

it.each([['draft', 'Finalizar'], ['finalized', 'Assinar']])('preserves %s actions and blocks repeated clicks', async (status, name) => {
  const pending = deferred();
  const action = status === 'draft' ? finalizeDocumentArtifact : signDocumentArtifact;
  action.mockReturnValue(pending.promise);
  listDocumentArtifacts.mockResolvedValue({ data: [{ id: 'document', source_type: 'meal_plan', source_key: '1', status, revision: 7 }], error: null });
  render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  const button = await screen.findByRole('button', { name });
  fireEvent.click(button); fireEvent.click(button);
  expect(action).toHaveBeenCalledTimes(1);
  if (status === 'draft') expect(action).toHaveBeenCalledWith('document', 7);
  else expect(action).toHaveBeenCalledWith('document');
  await act(async () => pending.resolve({ data: {}, error: null }));
  expect(button.disabled).toBe(false);
});

it('recovers from PDF failures and does not download invalid data', async () => {
  listDocumentArtifacts.mockResolvedValue({ data: [{ id: 'document', source_type: 'meal_plan', source_key: '1', status: 'signed' }], error: null });
  getDocumentArtifact.mockRejectedValue(new Error('PRIVATE_PDF_ERROR'));
  render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  const button = await screen.findByRole('button', { name: 'PDF oficial' }); fireEvent.click(button);
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'PDF não gerado' })));
  expect(button.disabled).toBe(false); expect(downloadCanonicalDocumentPdf).not.toHaveBeenCalled();
  getDocumentArtifact.mockResolvedValue({ data: { sha256: 'server-hash' }, error: null });
  downloadCanonicalDocumentPdf.mockResolvedValue(undefined); fireEvent.click(button);
  await waitFor(() => expect(downloadCanonicalDocumentPdf).toHaveBeenCalledWith({ sha256: 'server-hash' }));
});

it('never shows success from a mutation completed after leaving the plan', async () => {
  const pending = deferred(); createDocumentArtifactFromMealPlan.mockReturnValue(pending.promise);
  const ui = render(<MealPlanDocumentActions plan={plan} patientId="patient" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Preparar' }));
  ui.rerender(<MealPlanDocumentActions plan={{ ...plan, id: 2 }} patientId="other-patient" />);
  await screen.findByRole('button', { name: 'Preparar' });
  await act(async () => pending.resolve({ data: {}, error: null }));
  expect(toast).not.toHaveBeenCalled(); expect(listDocumentArtifacts).toHaveBeenCalledTimes(2);
});
