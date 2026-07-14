import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useClinicalEvolution } from './useClinicalEvolution';
import * as evolutionQueries from '../api/evolution-queries';

vi.mock('../api/evolution-queries', () => ({
  updateClinicalRecordDraft: vi.fn(),
  finalizeClinicalRecord: vi.fn(),
  signClinicalRecord: vi.fn(),
  cosignClinicalRecord: vi.fn(),
}));

describe('useClinicalEvolution', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockDraftRecord = { id: 'rec-1', status: 'draft', content: { context: 'initial' } };

  it('initializes with provided record data', () => {
    const { result } = renderHook(() => useClinicalEvolution(mockDraftRecord));
    
    expect(result.current.record).toEqual(mockDraftRecord);
    expect(result.current.content).toEqual({ context: 'initial' });
    expect(result.current.status).toBe('idle');
    expect(result.current.isDirty).toBe(false);
  });

  it('marks as dirty and schedules autosave on content change', async () => {
    const { result } = renderHook(() => useClinicalEvolution(mockDraftRecord));
    
    act(() => {
      result.current.setContent({ context: 'updated' });
    });

    expect(result.current.isDirty).toBe(true);
    expect(result.current.content).toEqual({ context: 'updated' });
    expect(result.current.status).toBe('editing');

    // Fast-forward 15s
    evolutionQueries.updateClinicalRecordDraft.mockResolvedValue({
      data: { ...mockDraftRecord, content: { context: 'updated' } },
      error: null
    });

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    expect(evolutionQueries.updateClinicalRecordDraft).toHaveBeenCalledWith(
      'rec-1',
      { context: 'updated' },
      'professional_private'
    );
  });

  it('forceSave triggers immediate save', async () => {
    const { result } = renderHook(() => useClinicalEvolution(mockDraftRecord));
    
    act(() => {
      result.current.setContent({ context: 'updated' });
    });

    evolutionQueries.updateClinicalRecordDraft.mockResolvedValue({
      data: { ...mockDraftRecord, content: { context: 'updated' } },
      error: null
    });

    await act(async () => {
      const saved = await result.current.forceSave();
      expect(saved).toBe(true);
    });

    expect(result.current.isDirty).toBe(false);
    expect(result.current.status).toBe('idle');
  });

  it('does not allow editing finalized records', () => {
    const finalizedRecord = { ...mockDraftRecord, status: 'finalized' };
    const { result } = renderHook(() => useClinicalEvolution(finalizedRecord));
    
    act(() => {
      result.current.setContent({ context: 'updated' });
    });

    // Content should not change, isDirty remains false
    expect(result.current.isDirty).toBe(false);
    expect(result.current.content).toEqual({ context: 'initial' });
  });

  it('handles finalize action', async () => {
    const { result } = renderHook(() => useClinicalEvolution(mockDraftRecord));
    
    evolutionQueries.finalizeClinicalRecord.mockResolvedValue({
      data: { ...mockDraftRecord, status: 'finalized' },
      error: null
    });

    await act(async () => {
      const finalized = await result.current.finalize('reason');
      expect(finalized).toBe(true);
    });

    expect(evolutionQueries.finalizeClinicalRecord).toHaveBeenCalledWith(
      'rec-1',
      { context: 'initial' },
      'reason'
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.record.status).toBe('finalized');
  });

  it('handles sign action', async () => {
    const finalizedRecord = { ...mockDraftRecord, status: 'finalized' };
    const { result } = renderHook(() => useClinicalEvolution(finalizedRecord));
    
    evolutionQueries.signClinicalRecord.mockResolvedValue({
      data: { ...finalizedRecord, status: 'signed' },
      error: null
    });

    await act(async () => {
      const signed = await result.current.sign();
      expect(signed).toBe(true);
    });

    expect(evolutionQueries.signClinicalRecord).toHaveBeenCalledWith('rec-1');
    expect(result.current.record.status).toBe('signed');
  });

  it('handles errors properly', async () => {
    const { result } = renderHook(() => useClinicalEvolution(mockDraftRecord));
    
    act(() => {
      result.current.setContent({ context: 'updated' });
    });

    evolutionQueries.updateClinicalRecordDraft.mockResolvedValue({
      data: null,
      error: { message: 'Fake error' }
    });

    await act(async () => {
      const saved = await result.current.forceSave();
      expect(saved).toBe(false);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Fake error');
    expect(result.current.isDirty).toBe(true); // Remains dirty since save failed
  });
});
