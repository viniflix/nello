import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as evolutionQueries from '../api/evolution-queries';
import { useClinicalEvolution } from './useClinicalEvolution';

vi.mock('../api/evolution-queries', () => ({
  finalizeClinicalRecord: vi.fn(),
  signClinicalRecord: vi.fn(),
  updateClinicalRecordDraft: vi.fn(),
}));

const draft = (overrides = {}) => ({
  id: 'rec-1',
  status: 'draft',
  revision: 1,
  updated_at: '2026-07-14T09:00:00.000Z',
  visibility: 'professional_private',
  content: { context: '<p>Inicial</p>' },
  ...overrides,
});

const deferred = () => {
  let resolve;
  const promise = new Promise((resolver) => { resolve = resolver; });
  return { promise, resolve };
};

describe('useClinicalEvolution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves with the current revision and returns a structured success result', async () => {
    evolutionQueries.updateClinicalRecordDraft.mockResolvedValue({
      data: draft({ revision: 2, updated_at: '2026-07-14T10:00:00.000Z' }),
      error: null,
    });
    const { result } = renderHook(() => useClinicalEvolution(draft()));

    act(() => result.current.setContent({ context: '<p>Atualizado</p>' }));
    let outcome;
    await act(async () => { outcome = await result.current.forceSave(); });

    expect(evolutionQueries.updateClinicalRecordDraft).toHaveBeenCalledWith(
      'rec-1',
      { context: '<p>Atualizado</p>' },
      'professional_private',
      1,
    );
    expect(outcome).toEqual({ ok: true, reason: 'saved' });
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.record.revision).toBe(2);
    expect(result.current.lastSaved).toBe('2026-07-14T10:00:00.000Z');
  });

  it('returns clean without calling the server when there is nothing to save', async () => {
    const { result } = renderHook(() => useClinicalEvolution(draft()));
    let outcome;

    await act(async () => { outcome = await result.current.forceSave(); });

    expect(outcome).toEqual({ ok: true, reason: 'clean' });
    expect(evolutionQueries.updateClinicalRecordDraft).not.toHaveBeenCalled();
  });

  it('keeps edit B dirty when response A confirms only the older snapshot', async () => {
    const pending = deferred();
    evolutionQueries.updateClinicalRecordDraft.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useClinicalEvolution(draft()));

    act(() => result.current.setContent({ context: '<p>A</p>' }));
    let savePromise;
    act(() => { savePromise = result.current.forceSave(); });
    act(() => result.current.setContent({ context: '<p>B</p>' }));
    pending.resolve({
      data: draft({
        content: { context: '<p>A</p>' },
        revision: 2,
        updated_at: '2026-07-14T10:01:00.000Z',
      }),
      error: null,
    });
    await act(async () => { await savePromise; });

    expect(result.current.content).toEqual({ context: '<p>B</p>' });
    expect(result.current.hasUnsavedChanges).toBe(true);
    expect(result.current.record.revision).toBe(2);
    expect(result.current.lastSaved).toBe('2026-07-14T10:01:00.000Z');
  });

  it('preserves local content and exposes a revision conflict', async () => {
    evolutionQueries.updateClinicalRecordDraft.mockResolvedValue({
      data: null,
      error: { code: '40001', message: 'draft_revision_conflict' },
    });
    const { result } = renderHook(() => useClinicalEvolution(draft()));

    act(() => result.current.setContent({ context: '<p>Minha alteração</p>' }));
    let outcome;
    await act(async () => { outcome = await result.current.forceSave(); });

    expect(outcome).toEqual({ ok: false, reason: 'conflict' });
    expect(result.current.status).toBe('conflict');
    expect(result.current.conflict).toEqual(expect.objectContaining({
      code: '40001',
      message: 'draft_revision_conflict',
    }));
    expect(result.current.content).toEqual({ context: '<p>Minha alteração</p>' });
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it('ignores an old save response after switching records', async () => {
    const pending = deferred();
    evolutionQueries.updateClinicalRecordDraft.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(
      ({ initialRecord }) => useClinicalEvolution(initialRecord),
      { initialProps: { initialRecord: draft() } },
    );

    act(() => result.current.setContent({ context: '<p>Registro A</p>' }));
    let savePromise;
    act(() => { savePromise = result.current.forceSave(); });
    rerender({
      initialRecord: draft({
        id: 'rec-2',
        revision: 8,
        content: { context: '<p>Registro B</p>' },
        updated_at: '2026-07-14T11:00:00.000Z',
      }),
    });
    pending.resolve({
      data: draft({ revision: 2, content: { context: '<p>Registro A</p>' } }),
      error: null,
    });
    await act(async () => { await savePromise; });

    expect(result.current.record.id).toBe('rec-2');
    expect(result.current.record.revision).toBe(8);
    expect(result.current.content).toEqual({ context: '<p>Registro B</p>' });
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.conflict).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('clears a pending autosave when switching records', async () => {
    const { result, rerender } = renderHook(
      ({ initialRecord }) => useClinicalEvolution(initialRecord),
      { initialProps: { initialRecord: draft() } },
    );

    act(() => result.current.setContent({ context: '<p>Registro A</p>' }));
    rerender({ initialRecord: draft({ id: 'rec-2', content: {} }) });
    await act(async () => { vi.advanceTimersByTime(15_000); });

    expect(evolutionQueries.updateClinicalRecordDraft).not.toHaveBeenCalled();
  });

  it('finalizes with the latest revision after saving pending changes', async () => {
    evolutionQueries.updateClinicalRecordDraft.mockResolvedValue({
      data: draft({ revision: 2, content: { context: '<p>Atualizado</p>' } }),
      error: null,
    });
    evolutionQueries.finalizeClinicalRecord.mockResolvedValue({
      data: draft({ revision: 3, status: 'finalized' }),
      error: null,
    });
    const { result } = renderHook(() => useClinicalEvolution(draft()));

    act(() => result.current.setContent({ context: '<p>Atualizado</p>' }));
    let finalized;
    await act(async () => { finalized = await result.current.finalize('Motivo retroativo válido'); });

    expect(finalized).toBe(true);
    expect(evolutionQueries.finalizeClinicalRecord).toHaveBeenCalledWith(
      'rec-1',
      { context: '<p>Atualizado</p>' },
      2,
      'Motivo retroativo válido',
    );
    expect(result.current.record.status).toBe('finalized');
  });

  it('blocks edits while finalization is in flight so finalized content cannot diverge', async () => {
    const pending = deferred();
    evolutionQueries.finalizeClinicalRecord.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useClinicalEvolution(draft()));

    let finalizePromise;
    act(() => { finalizePromise = result.current.finalize(); });
    act(() => result.current.setContent({ context: '<p>Edição tardia</p>' }));

    expect(result.current.content).toEqual({ context: '<p>Inicial</p>' });
    expect(result.current.hasUnsavedChanges).toBe(false);

    pending.resolve({
      data: draft({ status: 'finalized', revision: 2 }),
      error: null,
    });
    await act(async () => { await finalizePromise; });

    expect(result.current.record.status).toBe('finalized');
    expect(result.current.content).toEqual({ context: '<p>Inicial</p>' });
  });

  it('does not schedule autosave while finalization owns the current revision', async () => {
    const pendingSave = deferred();
    const pendingFinalize = deferred();
    evolutionQueries.updateClinicalRecordDraft.mockReturnValue(pendingSave.promise);
    evolutionQueries.finalizeClinicalRecord.mockReturnValue(pendingFinalize.promise);
    const { result } = renderHook(() => useClinicalEvolution(draft()));

    act(() => result.current.setContent({ context: '<p>A</p>' }));
    let finalizePromise;
    act(() => { finalizePromise = result.current.finalize(); });
    act(() => result.current.setContent({ context: '<p>B</p>' }));

    pendingSave.resolve({
      data: draft({
        revision: 2,
        content: { context: '<p>A</p>' },
        updated_at: '2026-07-14T10:01:00.000Z',
      }),
      error: null,
    });
    await act(async () => { await Promise.resolve(); });

    expect(evolutionQueries.finalizeClinicalRecord).toHaveBeenCalledWith(
      'rec-1',
      { context: '<p>B</p>' },
      2,
      null,
    );
    expect(result.current.status).toBe('finalizing');

    await act(async () => { vi.advanceTimersByTime(15_000); });
    expect(evolutionQueries.updateClinicalRecordDraft).toHaveBeenCalledTimes(1);

    pendingFinalize.resolve({
      data: draft({ status: 'finalized', revision: 3, content: { context: '<p>B</p>' } }),
      error: null,
    });
    await act(async () => { await finalizePromise; });
  });

  it('synchronizes an externally signed version even when its revision is unchanged', () => {
    const finalizedRecord = draft({
      status: 'finalized',
      revision: 4,
      updated_at: '2026-07-14T11:00:00.000Z',
    });
    const { result, rerender } = renderHook(
      ({ initialRecord }) => useClinicalEvolution(initialRecord),
      { initialProps: { initialRecord: finalizedRecord } },
    );

    rerender({
      initialRecord: {
        ...finalizedRecord,
        status: 'signed',
        signed_at: '2026-07-14T11:05:00.000Z',
        updated_at: '2026-07-14T11:05:00.000Z',
      },
    });

    expect(result.current.record.status).toBe('signed');
    expect(result.current.record.signed_at).toBe('2026-07-14T11:05:00.000Z');
  });

  it('does not edit immutable records', () => {
    const finalized = draft({ status: 'finalized' });
    const { result } = renderHook(() => useClinicalEvolution(finalized));

    act(() => result.current.setContent({ context: '<p>Alterado</p>' }));

    expect(result.current.content).toEqual(finalized.content);
    expect(result.current.hasUnsavedChanges).toBe(false);
  });
});
