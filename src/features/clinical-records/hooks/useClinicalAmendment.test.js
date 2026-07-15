import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as amendmentQueries from '../api/amendment-queries';
import { useClinicalAmendment } from './useClinicalAmendment';

vi.mock('../api/amendment-queries', () => ({
  abandonClinicalRecordCorrection: vi.fn(),
  compareClinicalRecordVersions: vi.fn(),
  getAmendmentImpact: vi.fn(),
  invalidateClinicalRecord: vi.fn(),
  listClinicalRecordVersionChain: vi.fn(),
  startClinicalRecordCorrection: vi.fn(),
}));

const deferred = () => {
  let resolve;
  const promise = new Promise((resolver) => { resolve = resolver; });
  return { promise, resolve };
};

const impact = {
  record_id: 'record-1',
  root_record_id: 'root-1',
  chain_version: 1,
  known_references: [],
  impact_hash: 'hash-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  amendmentQueries.getAmendmentImpact.mockResolvedValue({ data: impact, error: null });
  amendmentQueries.listClinicalRecordVersionChain.mockResolvedValue({ data: [], error: null });
  amendmentQueries.compareClinicalRecordVersions.mockResolvedValue({ data: {}, error: null });
  amendmentQueries.startClinicalRecordCorrection.mockResolvedValue({ data: {}, error: null });
  amendmentQueries.abandonClinicalRecordCorrection.mockResolvedValue({ data: {}, error: null });
  amendmentQueries.invalidateClinicalRecord.mockResolvedValue({ data: {}, error: null });
});

describe('useClinicalAmendment', () => {
  it('loads normalized impact and the root version chain', async () => {
    const chain = [{ id: 'record-2', chain_version: 2 }];
    amendmentQueries.listClinicalRecordVersionChain.mockResolvedValue({ data: chain, error: null });
    const { result } = renderHook(() => useClinicalAmendment('record-1', 'root-1'));

    await act(async () => {
      await Promise.all([result.current.loadImpact(), result.current.loadChain()]);
    });

    expect(amendmentQueries.getAmendmentImpact).toHaveBeenCalledWith('record-1');
    expect(amendmentQueries.listClinicalRecordVersionChain).toHaveBeenCalledWith('root-1');
    expect(result.current.impact).toEqual(expect.objectContaining({
      recordId: 'record-1',
      impactHash: 'hash-1',
    }));
    expect(result.current.chain).toEqual(chain);
    expect(result.current.status).toBe('idle');
  });

  it('runs formal mutations with the bound record and refreshes the chain', async () => {
    const started = { amendment_id: 'amendment-1', replacement_record_id: 'record-2' };
    amendmentQueries.startClinicalRecordCorrection.mockResolvedValue({ data: started, error: null });
    const { result } = renderHook(() => useClinicalAmendment('record-1', 'root-1'));
    let outcome;

    await act(async () => {
      outcome = await result.current.startCorrection(
        'Correção factual devidamente justificada',
        { impact_hash: 'hash-1', confirmed: true },
      );
    });

    expect(amendmentQueries.startClinicalRecordCorrection).toHaveBeenCalledWith(
      'record-1',
      'Correção factual devidamente justificada',
      { impact_hash: 'hash-1', confirmed: true },
    );
    expect(amendmentQueries.listClinicalRecordVersionChain).toHaveBeenCalledWith('root-1');
    expect(outcome).toEqual(started);
  });

  it('clears stale data and reloads the chain when a mutation conflicts', async () => {
    const conflict = { code: '40001', message: 'amendment_impact_changed' };
    amendmentQueries.invalidateClinicalRecord.mockResolvedValue({ data: null, error: conflict });
    amendmentQueries.compareClinicalRecordVersions.mockResolvedValue({ data: { sections: [] }, error: null });
    const { result } = renderHook(() => useClinicalAmendment('record-1', 'root-1'));

    await act(async () => {
      await result.current.loadImpact();
      await result.current.compareVersions('record-1', 'record-2');
    });
    await act(async () => {
      await result.current.invalidateRecord(
        'Registro atribuído ao atendimento incorreto',
        { impact_hash: 'hash-1', confirmed: true },
      );
    });

    expect(result.current.conflict).toBe(conflict);
    expect(result.current.impact).toBeNull();
    expect(result.current.comparison).toBeNull();
    expect(result.current.status).toBe('conflict');
    expect(amendmentQueries.listClinicalRecordVersionChain).toHaveBeenLastCalledWith('root-1');
  });

  it('recognizes named conflict messages without exposing them as generic errors', async () => {
    const conflict = { code: 'P0001', message: 'amendment_chain_conflict' };
    amendmentQueries.abandonClinicalRecordCorrection.mockResolvedValue({ data: null, error: conflict });
    const { result } = renderHook(() => useClinicalAmendment('record-1'));

    await act(async () => {
      await result.current.abandonCorrection(
        'amendment-1',
        'Rascunho aberto por engano operacional',
      );
    });

    expect(result.current.conflict).toBe(conflict);
    expect(result.current.error).toBeNull();
    expect(amendmentQueries.listClinicalRecordVersionChain).toHaveBeenCalledWith('record-1');
  });

  it('ignores a stale response after the target record changes', async () => {
    const pending = deferred();
    amendmentQueries.getAmendmentImpact.mockReturnValueOnce(pending.promise);
    const { result, rerender } = renderHook(
      ({ recordId }) => useClinicalAmendment(recordId),
      { initialProps: { recordId: 'record-1' } },
    );
    let request;

    act(() => { request = result.current.loadImpact(); });
    rerender({ recordId: 'record-2' });
    pending.resolve({ data: impact, error: null });
    await act(async () => { await request; });

    expect(result.current.impact).toBeNull();
    expect(result.current.status).toBe('idle');
  });

  it('keeps callbacks stable while the target identifiers are unchanged', () => {
    const { result, rerender } = renderHook(
      ({ marker }) => ({ marker, amendment: useClinicalAmendment('record-1', 'root-1') }),
      { initialProps: { marker: 1 } },
    );
    const callbacks = {
      loadImpact: result.current.amendment.loadImpact,
      loadChain: result.current.amendment.loadChain,
      startCorrection: result.current.amendment.startCorrection,
      compareVersions: result.current.amendment.compareVersions,
    };

    rerender({ marker: 2 });

    expect(result.current.amendment).toEqual(expect.objectContaining(callbacks));
  });
});
