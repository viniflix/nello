import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvolutionEditor from './EvolutionEditor';
import * as evolutionHook from '../hooks/useClinicalEvolution';
import * as evolutionQueries from '../api/evolution-queries';

vi.mock('../hooks/useClinicalEvolution', () => ({ useClinicalEvolution: vi.fn() }));
vi.mock('../api/evolution-queries', () => ({ listEvolutionTemplates: vi.fn() }));
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

describe('EvolutionEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evolutionQueries.listEvolutionTemplates.mockResolvedValue({ data: templates, error: null });
    evolutionHook.useClinicalEvolution.mockReturnValue(hookState());
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
});
