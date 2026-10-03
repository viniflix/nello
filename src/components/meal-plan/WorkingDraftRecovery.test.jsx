import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import WorkingDraftRecovery from './WorkingDraftRecovery';
const state = vi.hoisted(() => ({ rows: [], calls: [], fail: false }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: () => {
    const filters = {};
    const query = { select: () => query, eq: (key, value) => { filters[key] = value; state.calls.push([key, value]); return query; }, or: value => { state.calls.push(['or', value]); return query; }, order: async () => ({ data: state.rows, error: null }), single: async () => ({ data: state.rows.find(row => row.id === filters.id), error: state.fail ? { code: 'OFFLINE' } : null }) };
    return query;
} } }));
beforeEach(() => { state.rows = [{ id: 'old-draft', draft_key: 'meal-plan-meal:patient:55:1780000000000:food:new', updated_at: '2026-10-03T00:00:00Z', payload: { notes: 'synthetic preserved edit' } }]; state.calls = []; state.fail = false; });
it('discovers a legacy food draft and resumes its exact saved identity without needing the old temporary meal id', async () => {
    const resume = vi.fn(); render(<WorkingDraftRecovery ownerId="owner" patientId="patient" onResume={resume} />);
    await screen.findByRole('heading', { name: 'Continue de onde parou' });
    fireEvent.click(screen.getByRole('button', { name: 'Retomar edição' }));
    await waitFor(() => expect(resume).toHaveBeenCalledWith(state.rows[0]));
    expect(state.calls).toContainEqual(['owner_id', 'owner']);
    expect(state.calls).toContainEqual(['id', 'old-draft']);
    expect(state.calls).toContainEqual(['or', 'draft_key.like.meal-plan:patient:%,draft_key.like.meal-plan-meal:patient:%']);
});
it('keeps the saved draft accessible when opening fails and allows retry', async () => {
    state.fail = true; const resume = vi.fn(); render(<WorkingDraftRecovery ownerId="owner" patientId="patient" onResume={resume} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar edição' }));
    await screen.findByRole('alert'); expect(resume).not.toHaveBeenCalled();
    state.fail = false; fireEvent.click(screen.getByRole('button', { name: 'Retomar edição' }));
    await waitFor(() => expect(resume).toHaveBeenCalledTimes(1));
});
