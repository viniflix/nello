import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import WorkingDraftRecovery, { trimWorkingDrafts } from './WorkingDraftRecovery';
const state = vi.hoisted(() => ({ rows: [], calls: [], fail: false, pending: null }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: () => {
    const filters = {};
    const query = { select: () => query, eq: (key, value) => { filters[key] = value; state.calls.push([key, value]); return query; }, or: value => { state.calls.push(['or', value]); return query; }, order: async () => ({ data: state.rows, error: null }), single: async () => state.pending || ({ data: state.rows.find(row => row.id === filters.id), error: state.fail ? { code: 'OFFLINE' } : null }), delete: () => query, maybeSingle: async () => {
        if (state.fail) return { data: null, error: { code: 'OFFLINE' } };
        const index = state.rows.findIndex(row => row.id === filters.id && row.owner_id === filters.owner_id && row.revision === filters.revision);
        if (index < 0) return { data: null, error: null };
        return { data: state.rows.splice(index, 1)[0], error: null };
    } };
    return query;
} } }));
beforeEach(() => { state.rows = [{ id: 'old-draft', draft_key: 'meal-plan-meal:patient:55:1780000000000:food:new', updated_at: '2026-10-03T00:00:00Z', payload: { notes: 'synthetic preserved edit' } }]; state.calls = []; state.fail = false; state.pending = null; });
it('does not restore an old patient response after the editor changes account or patient', async () => {
    let finish; state.pending = new Promise(resolve => { finish = resolve; });
    const resume = vi.fn(), old = state.rows[0];
    const view = render(<WorkingDraftRecovery ownerId="owner" patientId="patient" onResume={resume} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar edição' }));
    state.rows = [];
    view.rerender(<WorkingDraftRecovery ownerId="another-owner" patientId="another-patient" onResume={resume} />);
    await act(async () => { finish({ data: old, error: null }); await state.pending; });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Abrindo...' })).not.toBeInTheDocument());
    expect(resume).not.toHaveBeenCalled();
});
it('discovers a legacy food draft and resumes its exact saved identity without needing the old temporary meal id', async () => {
    const resume = vi.fn(); render(<WorkingDraftRecovery ownerId="owner" patientId="patient" onResume={resume} />);
    await screen.findByRole('heading', { name: 'Continue de onde parou' });
    fireEvent.click(screen.getByRole('button', { name: 'Retomar edição' }));
    await waitFor(() => expect(resume).toHaveBeenCalledWith(state.rows[0]));
    expect(state.calls).toContainEqual(['owner_id', 'owner']);
    expect(state.calls).toContainEqual(['id', 'old-draft']);
    expect(state.calls).toContainEqual(['or', 'draft_key.like.meal-plan:patient:%,draft_key.like.meal-plan-meal:patient:%']);
});
it('removes only the older excess autosave copies and protects another owner and concurrent revisions', async () => {
    const own = Array.from({ length: 7 }, (_, index) => ({ id: `draft-${index}`, owner_id: 'owner', revision: 1 }));
    const other = { id: 'other', owner_id: 'another-owner', revision: 1 };
    state.rows = [...own, other];
    expect(await trimWorkingDrafts('owner', own, 3)).toEqual(own.slice(0, 3));
    expect(state.rows).toEqual([...own.slice(0, 3), other]);
    state.rows[2] = { ...state.rows[2], revision: 2 };
    await expect(trimWorkingDrafts('owner', own.slice(0, 3), 2)).rejects.toThrow('unconfirmed');
    expect(state.rows.some(row => row.id === 'draft-2' && row.revision === 2)).toBe(true);
});
it('keeps the saved draft accessible when opening fails and allows retry', async () => {
    state.fail = true; const resume = vi.fn(); render(<WorkingDraftRecovery ownerId="owner" patientId="patient" onResume={resume} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar edição' }));
    await screen.findByRole('alert'); expect(resume).not.toHaveBeenCalled();
    state.fail = false; fireEvent.click(screen.getByRole('button', { name: 'Retomar edição' }));
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
});
