import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import MealPlanMealForm from './MealPlanMealForm';
const state = vi.hoisted(() => ({ recovery: null, status: 'recoverable', flush: vi.fn(), restore: vi.fn(), queue: vi.fn() }));
vi.mock('@/hooks/useShadowDraft', () => ({ useShadowDraft: () => ({ ready: true, status: state.status, recovery: state.recovery, restore: state.restore, flush: state.flush, queue: state.queue }) }));
vi.mock('./SubstitutionDialog', () => ({ default: () => null }));
vi.mock('./AddFoodToMealDialog', () => ({ default: props => props.isOpen ? <div data-testid="food-editor">{props.shadowKey} {props.autoRestore ? 'auto restore' : ''}</div> : null }));
beforeEach(() => { state.status = 'recoverable'; state.queue.mockReset(); state.restore.mockReset(); state.flush.mockReset().mockResolvedValue(true); state.recovery = { source: 'cloud', payload: { formData: { name: 'Recovered lunch', meal_type: 'other', meal_time: '12:00', notes: 'Confirmed saved note' }, foods: [] } }; state.restore.mockImplementation(() => { const payload = state.recovery.payload; state.recovery = null; return payload; }); });
it('reopens the explicitly selected legacy meal with the confirmed saved fields', async () => {
    render(<MealPlanMealForm isOpen ownerId="owner" shadowKey="legacy-key" recoveryDraft={{ id: 'legacy', draft_key: 'meal-plan-meal:patient:55:old' }} onClose={vi.fn()} onSave={vi.fn()} />);
    await screen.findByDisplayValue('Recovered lunch'); expect(screen.getByDisplayValue('Confirmed saved note')).toBeVisible();
    await waitFor(() => expect(state.restore).toHaveBeenCalledTimes(1));
});
it('opens the exact saved food editor and preserves its parent meal snapshot', async () => {
    render(<MealPlanMealForm isOpen ownerId="owner" shadowKey="current-key" recoveryDraft={{ id: 'food', draft_key: 'meal-plan-meal:patient:55:old:food:old', payload: { context: { mealSnapshot: state.recovery.payload } } }} onClose={vi.fn()} onSave={vi.fn()} />);
    await screen.findByDisplayValue('Recovered lunch');
    expect(screen.getByTestId('food-editor')).toHaveTextContent('meal-plan-meal:patient:55:old:food:old auto restore');
});
it('waits for pending changes before closing and does not close on a failed flush', async () => {
    state.recovery = null; state.status = 'local'; state.flush.mockResolvedValue(false); const close = vi.fn();
    render(<MealPlanMealForm isOpen ownerId="owner" shadowKey="key" onClose={close} onSave={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Observações/), { target: { value: 'Pending note' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
    await waitFor(() => expect(state.flush).toHaveBeenCalledTimes(1)); expect(close).not.toHaveBeenCalled();
});
