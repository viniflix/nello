import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import MealPlanForm from './MealPlanForm';
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const mocks = vi.hoisted(() => ({ shadow: { ready: true, status: 'idle', recovery: null, queue: vi.fn(), flush: vi.fn().mockResolvedValue(true), discard: vi.fn().mockResolvedValue(true) } }));
vi.mock('@/hooks/useShadowDraft', () => ({ useShadowDraft: () => mocks.shadow }));
vi.mock('@/hooks/useMealPlanDraft', () => ({ useMealPlanDraft: () => ({ draftId: null, saveStatus: 'idle', existingDraft: null, flushPlanInfo: async () => true }) }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getReferenceValues: async () => ({ data: null }), simulateMealPlanPortionAdjustment: () => null }));
vi.mock('./ImportMealFromProtocolDialog', () => ({ default: () => null }));
vi.mock('./SubstitutionDialog', () => ({ default: () => null }));
vi.mock('./MacrosChart', () => ({ default: () => null }));
vi.mock('./FoodSelector', () => ({ default: props => props.isOpen ? <button onClick={() => props.onSelect({ id: 88, name: 'Alimento sintético', calories: 100 })}>Escolher alimento sintético</button> : null }));
vi.mock('@/components/nutrition', () => ({ PremiumPortionSelector: props => <input aria-label="Quantidade" value={props.value.quantity} onChange={event => props.onChange({ ...props.value, quantity: Number(event.target.value) })} /> }));

it('captures and restores the whole plan and unfinished meal/food editors after leaving the page', async () => {
    let saved;
    const session = { ready: true, status: 'saved', queue: value => { saved = structuredClone(value); }, flush: async () => true, discard: vi.fn().mockResolvedValue(true) };
    const props = { patientId: 'synthetic-patient', nutritionistId: 'synthetic-owner', session, initialData: { id: 55, updated_at: 'revision-1', name: 'Plano base', active_days: [], meals: [{ id: 10, name: 'Refeição já existente', foods: [{ id: 20, food: { name: 'Alimento já existente' }, food_id: 1, quantity: 100, calories: 100 }] }] }, onCancel: vi.fn() };
    const first = render(<React.StrictMode><MealPlanForm {...props} /></React.StrictMode>);
    fireEvent.change(screen.getByLabelText(/Nome do Plano/), { target: { value: 'Plano em andamento' } });
    fireEvent.click(screen.getByRole('button', { name: 'Nova Refeição', exact: true }));
    const mealDialog = await screen.findByRole('dialog', { name: 'Nova Refeição' });
    fireEvent.change(within(mealDialog).getByLabelText(/Observações/), { target: { value: 'Refeição ainda em preenchimento' } });
    fireEvent.click(within(mealDialog).getByRole('button', { name: 'Adicionar Alimento' }));
    const foodDialog = await screen.findByRole('dialog', { name: 'Adicionar Alimento' });
    fireEvent.click(within(foodDialog).getByRole('button', { name: 'Buscar Alimento' }));
    fireEvent.click(screen.getByText('Escolher alimento sintético'));
    fireEvent.change(within(foodDialog).getByLabelText('Quantidade'), { target: { value: '33' } });
    fireEvent.change(within(foodDialog).getByLabelText(/Observações/), { target: { value: 'Alimento ainda não adicionado' } });
    await waitFor(() => expect(saved.editor.state.foodEditor.state.notes).toBe('Alimento ainda não adicionado'));
    expect(saved.formData.name).toBe('Plano em andamento');
    expect(saved.meals[0].foods[0].food.name).toBe('Alimento já existente');
    expect(saved.editor.state.formData.notes).toBe('Refeição ainda em preenchimento');
    expect(saved.editor.state.foodEditor.state.portion.quantity).toBe(33);
    const snapshot = structuredClone(saved);
    first.unmount();
    render(<React.StrictMode><MealPlanForm {...props} restoredSession={snapshot} /></React.StrictMode>);
    const reopened = await screen.findByRole('dialog', { name: 'Adicionar Alimento' });
    await waitFor(() => expect(within(reopened).getByLabelText('Quantidade')).toHaveValue('33'));
    expect(within(reopened).getByLabelText(/Observações/)).toHaveValue('Alimento ainda não adicionado');
    expect(within(reopened).getByText('Alimento sintético')).toBeVisible();
    await waitFor(() => expect(saved.meals[0].foods[0].food.name).toBe('Alimento já existente'));
    expect(session.discard).not.toHaveBeenCalled();
}, 15000);

it('uses the last applied revision as the baseline for edits made after saving', async () => {
    let snapshot;
    const applied = { id: 55, confirmed_at: '2026-10-02T18:00:00Z', updated_at: '2026-10-03T03:00:00Z' };
    const session = { ready: true, queue: value => { snapshot = value; }, discard: vi.fn().mockResolvedValue(true), flush: async () => true };
    const initialData = { ...applied, updated_at: '2026-10-02T20:00:00Z', name: 'Plano sintético', start_date: '2026-10-02', active_days: ['monday'], meals: [{ id: 10, name: 'Café', meal_type: 'breakfast', foods: [{ id: 20, food_id: 1, quantity: 100, calories: 100, food: { name: 'Alimento' } }] }] };
    render(<MealPlanForm patientId="synthetic-patient" nutritionistId="synthetic-owner" initialData={initialData} session={session} onSubmit={async () => applied} />);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(session.discard).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText(/Descrição \(opcional\)/), { target: { value: 'Nova edição depois de aplicar' } });
    await waitFor(() => expect(snapshot.baselineAppliedAt).toBe(applied.updated_at));
});

it('reorders a meal with a pointer gesture and saves the complete reordered session', async () => {
    const previousPointerEvent = window.PointerEvent;
    const previousHitTest = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
    vi.stubGlobal('PointerEvent', MouseEvent);
    let snapshot;
    const session = { ready: true, queue: value => { snapshot = value; } };
    try {
        render(<MealPlanForm patientId="synthetic-patient" nutritionistId="synthetic-owner" session={session} initialData={{ id: 55, name: 'Plano', meals: [
            { id: 10, name: 'Café', foods: [{ id: 20, food_id: 1, quantity: 100, calories: 100, food: { name: 'Pão' } }] },
            { id: 11, name: 'Opção 2', include_in_totals: false, foods: [{ id: 21, food_id: 2, quantity: 30, calories: 60, food: { name: 'Queijo' } }] }
        ] }} />);
        const handle = screen.getByRole('button', { name: 'Arrastar Opção 2' });
        const target = screen.getByRole('button', { name: 'Arrastar Café' }).closest('[data-meal-sort-index]');
        Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target });
        fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 100 });
        fireEvent.pointerUp(handle, { clientX: 10, clientY: 102 });
        expect(screen.getAllByRole('button', { name: /^Arrastar/ })[0]).toHaveAccessibleName('Arrastar Café');
        fireEvent.pointerDown(handle, { button: 0, clientX: 10, clientY: 100 });
        fireEvent.pointerUp(handle, { clientX: 10, clientY: 20 });
        expect(screen.getAllByRole('button', { name: /^Arrastar/ })[0]).toHaveAccessibleName('Arrastar Opção 2');
        await waitFor(() => expect(snapshot.meals[0].name).toBe('Opção 2'));
        expect(snapshot.meals[0].include_in_totals).toBe(false);
        expect(snapshot.meals[0].foods[0].food.name).toBe('Queijo');
        expect(snapshot.meals.map(meal => meal.order_index)).toEqual([0, 1]);
    } finally {
        vi.stubGlobal('PointerEvent', previousPointerEvent);
        if (previousHitTest) Object.defineProperty(document, 'elementFromPoint', previousHitTest);
        else delete document.elementFromPoint;
    }
});

it('edits a food directly from the plan without losing its alternatives or changing the other food', async () => {
    let snapshot;
    const session = { ready: true, status: 'saved', queue: value => { snapshot = value; }, flush: async () => true };
    render(<MealPlanForm patientId="patient" nutritionistId="owner" session={session} initialData={{ id: 55, name: 'Plano', meals: [{ id: 10, name: 'Café', meal_type: 'breakfast', foods: [
        { id: 20, food_id: 1, quantity: 100, calories: 100, food: { id: 1, name: 'Pão' }, substitutes: [{ food_id: 3, quantity: 50 }] },
        { id: 21, food_id: 2, quantity: 30, calories: 60, food: { id: 2, name: 'Queijo' } },
    ] }] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar alimento Pão' }));
    const food = await screen.findByRole('dialog', { name: 'Editar Alimento' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.change(within(food).getByLabelText('Quantidade'), { target: { value: '50' } });
    fireEvent.click(within(food).getByRole('button', { name: 'Atualizar', exact: true }));
    const meal = await screen.findByRole('dialog', { name: 'Editar Refeição' });
    fireEvent.click(within(meal).getByRole('button', { name: 'Atualizar Refeição' }));
    await waitFor(() => expect(snapshot.meals[0].foods[0].quantity).toBe(50));
    expect(snapshot.meals[0].foods[0].substitutes).toEqual([{ food_id: 3, quantity: 50 }]);
    expect(snapshot.meals[0].foods[1].quantity).toBe(30);
});
