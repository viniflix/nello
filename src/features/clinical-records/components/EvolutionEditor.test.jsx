import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const deferred = () => {
  let resolve;
  const promise = new Promise((resolver) => { resolve = resolver; });
  return { promise, resolve };
};

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
  abandonCorrection: vi.fn(),
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

  it('derives correction metadata from the loaded chain after reopening a list payload', async () => {
    const correctionDraft = {
      ...record,
      id: 'replacement-2',
      replaces_record_id: 'signed-v1',
      root_record_id: 'root-1',
      chain_version: 2,
      amendment_id: 'amendment-1',
      amendment_status: 'draft',
    };
    const chainRecord = {
      ...correctionDraft,
      amendment: {
        id: 'amendment-1',
        type: 'correction',
        status: 'draft',
        reason: 'Correção factual devidamente justificada.',
        target_record_id: 'signed-v1',
        replacement_record_id: 'replacement-2',
      },
    };
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain: [chainRecord],
      loadChain: vi.fn().mockResolvedValue([chainRecord]),
    }));
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
    const replacement = {
      ...record,
      id: 'replacement-2',
      replaces_record_id: signedStudentRecord.id,
      root_record_id: 'root-1',
      chain_version: 2,
      amendment_id: 'amendment-1',
      amendment_status: 'draft',
    };
    const startCorrection = vi.fn().mockResolvedValue(replacement);
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain: [signedStudentRecord],
      loadChain: vi.fn().mockResolvedValue([signedStudentRecord]),
      startCorrection,
    }));
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
    await waitFor(() => expect(onReplacementOpen).toHaveBeenCalledWith({
      ...replacement,
      amendment: {
        id: 'amendment-1',
        type: 'correction',
        status: 'draft',
        reason: 'Correção factual devidamente justificada.',
        target_record_id: signedStudentRecord.id,
        replacement_record_id: 'replacement-2',
      },
    }));
  });

  it('lets the student author start a correction but never exposes invalidation', async () => {
    const signedStudentRecord = {
      ...record,
      status: 'signed',
      student_id: 'student-1',
      supervisor_id: 'supervisor-1',
      root_record_id: 'root-1',
      chain_version: 1,
    };
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain: [signedStudentRecord],
      loadChain: vi.fn().mockResolvedValue([signedStudentRecord]),
    }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: signedStudentRecord }));
    render(<EvolutionEditor
      initialRecord={signedStudentRecord}
      onBack={vi.fn()}
      currentUserId="student-1"
    />);

    expect(await screen.findByRole('button', { name: 'Corrigir' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invalidar' })).not.toBeInTheDocument();
  });

  it('lets an authorized correction author abandon with a trimmed reason and returns to the signed target', async () => {
    const signedTarget = {
      ...record,
      id: 'signed-v1',
      status: 'signed',
      root_record_id: 'signed-v1',
      chain_version: 1,
    };
    const correctionDraft = {
      ...record,
      id: 'replacement-v2',
      status: 'draft',
      replaces_record_id: signedTarget.id,
      root_record_id: signedTarget.id,
      chain_version: 2,
      amendment: {
        id: 'amendment-1',
        type: 'correction',
        status: 'draft',
        reason: 'Correção factual devidamente justificada.',
        target_record_id: signedTarget.id,
      },
    };
    const initialChain = [correctionDraft, signedTarget];
    const abandonedChain = [
      { ...correctionDraft, status: 'invalidated', amendment: { ...correctionDraft.amendment, status: 'abandoned' } },
      signedTarget,
    ];
    const abandonCorrection = vi.fn().mockResolvedValue({ amendment_id: 'amendment-1' });
    const loadChain = vi.fn()
      .mockResolvedValueOnce(initialChain)
      .mockResolvedValueOnce(abandonedChain);
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain: initialChain,
      loadChain,
      abandonCorrection,
    }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: correctionDraft }));
    const onReplacementOpen = vi.fn();
    const onRecordsRefresh = vi.fn().mockResolvedValue(undefined);
    render(<EvolutionEditor
      initialRecord={correctionDraft}
      onBack={vi.fn()}
      currentUserId="nutritionist-1"
      onReplacementOpen={onReplacementOpen}
      onRecordsRefresh={onRecordsRefresh}
    />);

    fireEvent.click(await screen.findByRole('button', { name: /abandonar corre/i }));
    const reason = screen.getByRole('textbox', { name: /motivo do abandono/i });
    fireEvent.change(reason, { target: { value: '  Motivo curto  ' } });
    expect(screen.getByRole('button', { name: /confirmar abandono/i })).toBeDisabled();
    fireEvent.change(reason, { target: { value: '  Correção aberta por engano e sem alteração clínica válida.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar abandono/i }));

    await waitFor(() => expect(abandonCorrection).toHaveBeenCalledWith(
      'amendment-1',
      'Correção aberta por engano e sem alteração clínica válida.',
    ));
    expect(loadChain).toHaveBeenCalledTimes(1);
    expect(onRecordsRefresh).toHaveBeenCalledTimes(1);
    expect(onReplacementOpen).toHaveBeenCalledWith(signedTarget);
  });

  it('keeps the correction draft open and shows the hook error when abandonment fails', async () => {
    const correctionDraft = {
      ...record,
      id: 'replacement-v2',
      author_id: 'student-1',
      replaces_record_id: 'signed-v1',
      root_record_id: 'signed-v1',
      student_id: 'student-1',
      supervisor_id: 'supervisor-1',
      amendment: { id: 'amendment-1', type: 'correction', status: 'draft', target_record_id: 'signed-v1' },
    };
    const chain = [correctionDraft, { ...record, id: 'signed-v1', status: 'signed' }];
    amendmentHook.useClinicalAmendment.mockImplementation(() => {
      const [error, setError] = React.useState(null);
      return amendmentState({
        chain,
        error,
        loadChain: vi.fn().mockResolvedValue(chain),
        abandonCorrection: vi.fn().mockImplementation(async () => {
          setError('Não foi possível abandonar a correção do registro.');
          return null;
        }),
      });
    });
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: correctionDraft }));
    render(<EvolutionEditor initialRecord={correctionDraft} onBack={vi.fn()} currentUserId="student-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /abandonar corre/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /motivo do abandono/i }), {
      target: { value: 'Correção aberta por engano e sem alteração clínica válida.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar abandono/i }));

    expect(await screen.findByRole('alert', { name: '' })).toHaveTextContent(/não foi possível abandonar a correção/i);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('blocks every competing mutation while responsible abandonment is in flight', async () => {
    const pending = deferred();
    const correctionDraft = {
      ...record,
      id: 'replacement-v2',
      author_id: 'student-1',
      replaces_record_id: 'signed-v1',
      root_record_id: 'signed-v1',
      amendment: { id: 'amendment-1', type: 'correction', status: 'draft', target_record_id: 'signed-v1' },
    };
    const chain = [correctionDraft, { ...record, id: 'signed-v1', status: 'signed' }];
    amendmentHook.useClinicalAmendment.mockImplementation(() => {
      const [status, setStatus] = React.useState('idle');
      return amendmentState({
        chain,
        status,
        loadChain: vi.fn().mockResolvedValue(chain),
        abandonCorrection: vi.fn().mockImplementation(() => {
          setStatus('abandoning-correction');
          return pending.promise;
        }),
      });
    });
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: correctionDraft }));
    render(<EvolutionEditor initialRecord={correctionDraft} onBack={vi.fn()} currentUserId="nutritionist-1" />);

    fireEvent.click(await screen.findByRole('button', { name: /abandonar corre/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /motivo do abandono/i }), {
      target: { value: 'Correção aberta por engano e sem alteração clínica válida.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar abandono/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /^finalizar$/i, hidden: true })).toBeDisabled());
    expect(screen.getByRole('button', { name: /voltar.*evolu/i, hidden: true })).toBeDisabled();
    expect(screen.getByLabelText('editor clinico', { selector: 'textarea' })).toBeDisabled();
    await act(async () => pending.resolve(null));
  });

  it('blocks duplicate abandonment and keeps student correction drafts away from finalize and sign', async () => {
    const pending = deferred();
    const correctionDraft = {
      ...record,
      id: 'replacement-v2',
      author_id: 'student-1',
      replaces_record_id: 'signed-v1',
      root_record_id: 'signed-v1',
      student_id: 'student-1',
      supervisor_id: 'supervisor-1',
      amendment: { id: 'amendment-1', type: 'correction', status: 'draft', target_record_id: 'signed-v1' },
    };
    const chain = [correctionDraft, { ...record, id: 'signed-v1', status: 'signed' }];
    const abandonCorrection = vi.fn().mockReturnValue(pending.promise);
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain,
      loadChain: vi.fn().mockResolvedValue(chain),
      abandonCorrection,
    }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: correctionDraft }));
    render(<EvolutionEditor initialRecord={correctionDraft} onBack={vi.fn()} currentUserId="student-1" />);

    expect(await screen.findByRole('button', { name: /abandonar corre/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finalizar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assinar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /abandonar corre/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /motivo do abandono/i }), {
      target: { value: 'Correção aberta por engano e sem alteração clínica válida.' },
    });
    const confirm = screen.getByRole('button', { name: /confirmar abandono/i });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(abandonCorrection).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    await act(async () => pending.resolve(null));
  });

  it('keeps unrelated users read-only and without actions on a correction draft', async () => {
    const correctionDraft = {
      ...record,
      id: 'replacement-v2',
      author_id: 'student-1',
      replaces_record_id: 'signed-v1',
      root_record_id: 'signed-v1',
      student_id: 'student-1',
      supervisor_id: 'supervisor-1',
      amendment: { id: 'amendment-1', type: 'correction', status: 'draft', target_record_id: 'signed-v1' },
    };
    const chain = [correctionDraft, { ...record, id: 'signed-v1', status: 'signed' }];
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain,
      loadChain: vi.fn().mockResolvedValue(chain),
    }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: correctionDraft }));
    render(<EvolutionEditor initialRecord={correctionDraft} onBack={vi.fn()} currentUserId="unrelated-user" />);

    expect(await screen.findByLabelText('editor clinico')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /abandonar|finalizar|assinar|corrigir|invalidar/i }))
      .not.toBeInTheDocument();
  });

  it('keeps a linked student read-only when the supervisor authored the correction', async () => {
    const supervisorCorrection = {
      ...record,
      id: 'replacement-v2',
      author_id: 'supervisor-1',
      replaces_record_id: 'signed-v1',
      root_record_id: 'signed-v1',
      student_id: 'student-1',
      supervisor_id: 'supervisor-1',
      amendment: {
        id: 'amendment-1',
        type: 'correction',
        status: 'draft',
        actor_id: 'supervisor-1',
        target_record_id: 'signed-v1',
      },
    };
    const chain = [supervisorCorrection, { ...record, id: 'signed-v1', status: 'signed' }];
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain,
      loadChain: vi.fn().mockResolvedValue(chain),
    }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: supervisorCorrection }));
    render(<EvolutionEditor initialRecord={supervisorCorrection} onBack={vi.fn()} currentUserId="student-1" />);

    expect(await screen.findByLabelText('editor clinico')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /abandonar corre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /finalizar|assinar|invalidar/i })).not.toBeInTheDocument();
  });

  it('closes and safely returns after successful abandonment even when parent refresh fails', async () => {
    const signedTarget = {
      ...record,
      id: 'signed-v1',
      status: 'signed',
      root_record_id: 'signed-v1',
      chain_version: 1,
    };
    const correctionDraft = {
      ...record,
      id: 'replacement-v2',
      author_id: 'nutritionist-1',
      replaces_record_id: signedTarget.id,
      root_record_id: signedTarget.id,
      chain_version: 2,
      amendment: {
        id: 'amendment-1', type: 'correction', status: 'draft', target_record_id: signedTarget.id,
      },
    };
    const chain = [correctionDraft, signedTarget];
    const loadChain = vi.fn()
      .mockResolvedValueOnce(chain)
      .mockRejectedValueOnce(new Error('redundant refresh must not run'));
    const abandonCorrection = vi.fn().mockResolvedValue({ amendment_id: 'amendment-1' });
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain,
      loadChain,
      abandonCorrection,
    }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: correctionDraft }));
    const onReplacementOpen = vi.fn();
    const onRecordsRefresh = vi.fn().mockRejectedValue(new Error('parent refresh failed'));
    render(<EvolutionEditor
      initialRecord={correctionDraft}
      onBack={vi.fn()}
      currentUserId="nutritionist-1"
      onReplacementOpen={onReplacementOpen}
      onRecordsRefresh={onRecordsRefresh}
    />);

    fireEvent.click(await screen.findByRole('button', { name: /abandonar corre/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /motivo do abandono/i }), {
      target: { value: 'Correção aberta por engano e sem alteração clínica válida.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar abandono/i }));

    await waitFor(() => expect(abandonCorrection).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(loadChain).toHaveBeenCalledTimes(1);
    expect(onRecordsRefresh).toHaveBeenCalledTimes(1);
    expect(onReplacementOpen).toHaveBeenCalledWith(signedTarget);
  });

  it('shows amendment actions only to the responsible signer of a signed current record', async () => {
    const signedRecord = { ...record, status: 'signed', root_record_id: 'root-1' };
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain: [signedRecord],
      loadChain: vi.fn().mockResolvedValue([signedRecord]),
    }));
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
    expect(await screen.findByRole('button', { name: 'Corrigir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invalidar' })).toBeInTheDocument();
  });

  it('keeps amendment actions hidden until the chain confirms the current signed record', async () => {
    const signedRecord = { ...record, status: 'signed', root_record_id: 'root-1' };
    const pendingChain = deferred();
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain: [signedRecord],
      loadChain: vi.fn().mockReturnValue(pendingChain.promise),
    }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: signedRecord }));
    render(<EvolutionEditor initialRecord={signedRecord} onBack={vi.fn()} currentUserId="nutritionist-1" />);

    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
    await act(async () => {
      pendingChain.resolve([signedRecord]);
      await pendingChain.promise;
    });
    expect(await screen.findByRole('button', { name: 'Corrigir' })).toBeInTheDocument();
  });

  it('does not offer duplicate amendment actions while a correction draft is open in the chain', async () => {
    const signedRecord = { ...record, status: 'signed', root_record_id: 'root-1', chain_version: 1 };
    const replacementDraft = {
      ...record,
      id: 'replacement-2',
      root_record_id: 'root-1',
      chain_version: 2,
      replaces_record_id: signedRecord.id,
      amendment: { type: 'correction', status: 'draft' },
    };
    const chain = [replacementDraft, signedRecord];
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({
      chain,
      loadChain: vi.fn().mockResolvedValue(chain),
    }));
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: signedRecord }));
    render(<EvolutionEditor initialRecord={signedRecord} onBack={vi.fn()} currentUserId="nutritionist-1" />);

    await waitFor(() => expect(screen.getAllByTestId('version-row')).toHaveLength(2));
    expect(screen.queryByRole('button', { name: 'Corrigir' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Invalidar' })).not.toBeInTheDocument();
  });

  it('reloads the amendment chain and parent after signing a correction replacement', async () => {
    const correctionRecord = {
      ...record,
      id: 'replacement-2',
      status: 'finalized',
      replaces_record_id: 'target-1',
      root_record_id: 'target-1',
      chain_version: 2,
    };
    const draftChain = [
      {
        ...correctionRecord,
        status: 'finalized',
        amendment: {
          id: 'amendment-1',
          type: 'correction',
          status: 'draft',
          reason: 'Correção factual devidamente justificada.',
          target_record_id: 'target-1',
          replacement_record_id: 'replacement-2',
        },
      },
      { ...record, id: 'target-1', status: 'signed', root_record_id: 'target-1', chain_version: 1 },
    ];
    const effectiveChain = [
      {
        ...draftChain[0],
        status: 'signed',
        amendment: { ...draftChain[0].amendment, status: 'effective' },
      },
      { ...draftChain[1], status: 'corrected' },
    ];
    const initialChain = deferred();
    const loadChainRequest = vi.fn()
      .mockReturnValueOnce(initialChain.promise)
      .mockResolvedValueOnce(effectiveChain);
    amendmentHook.useClinicalAmendment.mockImplementation(() => {
      const [chain, setChain] = React.useState([]);
      const loadChain = React.useCallback(async () => {
        const nextChain = await loadChainRequest();
        setChain(nextChain);
        return nextChain;
      }, []);
      return amendmentState({ chain, loadChain });
    });
    const sign = vi.fn().mockResolvedValue(true);
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: correctionRecord, sign }));
    const onRecordsRefresh = vi.fn().mockResolvedValue(undefined);
    render(<EvolutionEditor
      initialRecord={correctionRecord}
      onBack={vi.fn()}
      currentUserId="nutritionist-1"
      onRecordsRefresh={onRecordsRefresh}
    />);

    expect(screen.queryByText(/correção em preparação/i)).not.toBeInTheDocument();
    await act(async () => {
      initialChain.resolve(draftChain);
      await initialChain.promise;
    });
    expect((await screen.findAllByRole('alert')).some((alert) => (
      /correção em preparação/i.test(alert.textContent)
    ))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /assinar registro/i }));
    await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(loadChainRequest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onRecordsRefresh).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByRole('alert').some((alert) => (
      /correção em preparação/i.test(alert.textContent)
    ))).toBe(false);
    expect(screen.getByText('Vigente')).toBeInTheDocument();
    expect(screen.getByText('Substituído')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir vers.o 2, vigente/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir vers.o 1, substitu.do/i })).toBeInTheDocument();
    expect(loadChainRequest.mock.invocationCallOrder[1])
      .toBeLessThan(onRecordsRefresh.mock.invocationCallOrder[0]);
  });

  it('keeps normal signing on the existing path without an amendment refresh', async () => {
    const finalizedRecord = { ...record, status: 'finalized' };
    const loadChain = vi.fn().mockResolvedValue([finalizedRecord]);
    amendmentHook.useClinicalAmendment.mockReturnValue(amendmentState({ chain: [finalizedRecord], loadChain }));
    const sign = vi.fn().mockResolvedValue(true);
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState({ record: finalizedRecord, sign }));
    const onRecordsRefresh = vi.fn();
    render(<EvolutionEditor
      initialRecord={finalizedRecord}
      onBack={vi.fn()}
      currentUserId="nutritionist-1"
      onRecordsRefresh={onRecordsRefresh}
    />);

    fireEvent.click(screen.getByRole('button', { name: /assinar registro/i }));
    await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
    expect(loadChain).toHaveBeenCalledTimes(1);
    expect(onRecordsRefresh).not.toHaveBeenCalled();
  });
});
