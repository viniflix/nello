import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvolutionEditor from './EvolutionEditor';
import * as evolutionHook from '../hooks/useClinicalEvolution';
import * as amendmentHook from '../hooks/useClinicalAmendment';
import * as evolutionQueries from '../api/evolution-queries';

vi.mock('../hooks/useClinicalEvolution', () => ({ useClinicalEvolution: vi.fn() }));
vi.mock('../hooks/useClinicalAmendment', () => ({ useClinicalAmendment: vi.fn() }));
vi.mock('../api/evolution-queries', () => ({ listEvolutionTemplates: vi.fn() }));
const signIn = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'nutritionist-1', email: 'pro@example.com' }, signIn }),
}));
vi.mock('./RichTextEditor', () => ({
  default: ({ value, onChange, disabled }) => (
    <textarea aria-label="editor clinico" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
  ),
}));
vi.mock('./SaveStatusIndicator', () => ({ default: () => null }));

const record = {
  id: 'record-1',
  status: 'draft',
  nutritionist_id: 'nutritionist-1',
  encounter_at: new Date().toISOString(),
  template_code: 'soap',
};
const templates = [{
  code: 'soap',
  name: 'SOAP',
  sections: [
    { key: 'subjective', label: 'Subjetivo', required: true },
    { key: 'objective', label: 'Objetivo', required: false },
  ],
}];

const hookState = (overrides = {}) => ({
  record,
  content: { subjective: '<p>Relato</p>', objective: '<p>Medidas</p>' },
  visibility: 'professional_private',
  status: 'editing',
  error: null,
  conflict: null,
  hasUnsavedChanges: true,
  lastSaved: null,
  setContent: vi.fn(),
  setVisibility: vi.fn(),
  forceSave: vi.fn().mockResolvedValue({ ok: true, reason: 'saved' }),
  finalize: vi.fn(),
  sign: vi.fn(),
  ...overrides,
});

const amendmentState = (overrides = {}) => ({
  impact: { impactHash: 'impact-1', visibility: 'professional_private' },
  chain: [],
  comparison: null,
  status: 'idle',
  error: null,
  loadImpact: vi.fn().mockResolvedValue({ impactHash: 'impact-1' }),
  loadChain: vi.fn().mockResolvedValue([]),
  startCorrection: vi.fn(),
  invalidateRecord: vi.fn(),
  compareVersions: vi.fn(),
  ...overrides,
});

describe('EvolutionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evolutionQueries.listEvolutionTemplates.mockResolvedValue({ data: templates, error: null });
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState());
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState());
    signIn.mockResolvedValue({ error: null });
  });

  it('saves before going back and remains open on error or conflict', async () => {
    const onBack = vi.fn();
    const forceSave = vi.fn()
      .mockResolvedValueOnce({ ok: false, reason: 'conflict' })
      .mockResolvedValueOnce({ ok: false, reason: 'error' })
      .mockResolvedValueOnce({ ok: true, reason: 'saved' });
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ forceSave }));
    render(<EvolutionEditor initialRecord={record} onBack={onBack} currentUserId="nutritionist-1" />);

    const back = screen.getByRole('button', { name: /voltar.*evolu/i });
    fireEvent.click(back);
    await waitFor(() => expect(forceSave).toHaveBeenCalledTimes(1));
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(back);
    await waitFor(() => expect(forceSave).toHaveBeenCalledTimes(2));
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.click(back);
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });

  it('prevents beforeunload only while the draft is dirty', () => {
    const { unmount } = render(<EvolutionEditor initialRecord={record} onBack={vi.fn()} />);
    const dirtyEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    expect(dirtyEvent.defaultPrevented).toBe(true);
    unmount();

    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ hasUnsavedChanges: false }));
    render(<EvolutionEditor initialRecord={record} onBack={vi.fn()} />);
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });

  it('renders one active editor, accessible section navigation and visibility guidance', async () => {
    const state = hookState();
    evolutionHook.useClinicalEvolution.mockReturnValue(state);
    render(<EvolutionEditor initialRecord={record} onBack={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Subjetivo' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByLabelText('editor clinico')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Objetivo' }));
    expect(screen.getByRole('button', { name: 'Objetivo' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getAllByLabelText('editor clinico')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText(/visibilidade da evolu/i), {
      target: { value: 'share_later' },
    });
    expect(state.setVisibility).toHaveBeenCalledWith('share_later');
    expect(screen.getByText(/direitos legais de acesso e exporta/i)).toBeInTheDocument();
  });

  it('prefers the immutable record snapshot over the mutable current template sections', async () => {
    const versionedRecord = {
      ...record,
      template_version: 1,
      template_sections_snapshot: [{ key: 'historic', label: 'Seção congelada' }],
    };
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: versionedRecord }));
    render(<EvolutionEditor initialRecord={versionedRecord} onBack={vi.fn()} />);

    expect(await screen.findByRole('button', { name: 'Seção congelada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subjetivo' })).not.toBeInTheDocument();
  });

  it('shows conflict guidance without PDF or obsolete co-signature controls', async () => {
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({
      status: 'conflict',
      conflict: { message: 'draft_revision_conflict' },
    }));
    render(<EvolutionEditor initialRecord={record} onBack={vi.fn()} currentUserId="nutritionist-1" canCosign />);

    expect(await screen.findByText(/outra sess.o alterou este rascunho/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copiar conte.do local/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /co-assinar/i })).not.toBeInTheDocument();
  });

  it('identifies a correction draft, shows its target and reason, and locks visibility', async () => {
    const correctionDraft = {
      ...record,
      replaces_record_id: 'signed-v1',
      amendment: {
        type: 'correction',
        status: 'draft',
        reason: 'Correção factual devidamente justificada.',
      },
    };
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: correctionDraft }));
    render(<EvolutionEditor initialRecord={correctionDraft} onBack={vi.fn()} />);

    expect((await screen.findAllByRole('alert')).some((alert) => (
      /correção em preparação/i.test(alert.textContent)
    ))).toBe(true);
    expect(screen.getByText(/signed-v1/i)).toBeInTheDocument();
    expect(screen.getByText(/correção factual devidamente justificada/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/visibilidade da evolu/i)).toBeDisabled();
  });

  it('lets the responsible supervisor start a correction and opens the returned replacement', async () => {
    const signedStudentRecord = {
      ...record,
      status: 'signed',
      student_id: 'student-1',
      supervisor_id: 'supervisor-1',
      root_record_id: 'root-1',
      chain_version: 1,
    };
    const replacement = { ...record, id: 'replacement-2', replaces_record_id: signedStudentRecord.id };
    const startCorrection = vi.fn().mockResolvedValue(replacement);
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({ startCorrection }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: signedStudentRecord }));
    const onReplacementOpen = vi.fn();
    render(<EvolutionEditor
      initialRecord={signedStudentRecord}
      onBack={vi.fn()}
      currentUserId="supervisor-1"
      onReplacementOpen={onReplacementOpen}
    />);

    fireEvent.click(await screen.findByRole('button', { name: 'Corrigir' }));
    fireEvent.change(await screen.findByRole('textbox', { name: /motivo da corre/i }), {
      target: { value: 'Correção factual devidamente justificada.' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /confirmo que revisei o impacto/i }));
    fireEvent.click(screen.getByRole('button', { name: /iniciar corre/i }));

    await waitFor(() => expect(startCorrection).toHaveBeenCalledWith(
      'Correção factual devidamente justificada.',
      { impact_hash: 'impact-1', confirmed: true },
    ));
    await waitFor(() => expect(onReplacementOpen).toHaveBeenCalledWith(replacement));
  });

  it('shows amendment actions only to the responsible signer of a signed current record', async () => {
    const signedRecord = { ...record, status: 'signed', root_record_id: 'root-1' };
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: signedRecord }));
    const { rerender } = render(<EvolutionEditor
      initialRecord={signedRecord}
      onBack={vi.fn()}
      currentUserId="another-user"
    />);
    expect(await screen.findByText(/hist.rico de vers.es/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invalidar' })).not.toBeInTheDocument();

    rerender(<EvolutionEditor
      initialRecord={signedRecord}
      onBack={vi.fn()}
      currentUserId="nutritionist-1"
    />);
    expect(screen.getByRole('button', { name: 'Corrigir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invalidar' })).toBeInTheDocument();
  });
});
