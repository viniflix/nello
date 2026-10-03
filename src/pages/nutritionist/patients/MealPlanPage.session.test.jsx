import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import MealPlanPage from './MealPlanPage';
const test = vi.hoisted(() => ({ plans: [], snapshot: { kind: 'meal-plan-session', version: 1, baselineAppliedAt: '2026-10-02T20:00:00Z', planId: 55, formData: { name: 'Sessão interrompida' }, meals: [{ foods: [{ quantity: 33 }] }], editor: { open: true, state: { formData: { notes: 'Refeição incompleta' } } } } }));
vi.mock('@/hooks/useResolvedPatientId', () => ({ useResolvedPatientId: () => ({ patientId: test.patientId, paramValue: test.patientId }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } } }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useMealPlan', () => ({ useMealPlan: () => ({ plans: test.plans, activePlan: test.plans.find(plan => plan.is_active), pendingDrafts: [], loading: false, isFetching: false }) }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getMealPlanById: async () => { if (test.planPending) return test.planPending; await new Promise(resolve => setTimeout(resolve, 5)); return { data: { id: 55, patient_id: 'patient', is_draft: false, meals: [], ...(test.appliedCopy ? { name: 'Já aplicado' } : {}) } }; } }));
vi.mock('@/hooks/useMealPlanSession', async () => {
    const React = await import('react');
    const actual = await vi.importActual('@/hooks/useMealPlanSession');
    return { ...actual, useMealPlanSession: () => {
        const [recovery, setRecovery] = React.useState(test.noRecovery ? null : { source: 'cloud', payload: test.appliedCopy ? { ...test.snapshot, formData: { name: 'Já aplicado' }, meals: [], editor: { open: false } } : test.snapshot });
        return { ready: true, recovery, restore: () => { setRecovery(null); return test.snapshot; }, discard: async () => true };
    } };
});
vi.mock('@/hooks/useMealPlanController', async () => {
    const React = await import('react');
    return { useMealPlanController: () => {
        const [showForm, setShowForm] = React.useState(false);
        const [editingPlan, setEditingPlan] = React.useState(null);
        const [pendingDraft, setPendingDraft] = React.useState(null);
        return { showForm, setShowForm, editingPlan, setEditingPlan, pendingDraft, setPendingDraft, handleSubmit: async () => ({ id: 55 }), templateName: '', templateTags: '', formatDate: value => value };
    } };
});
vi.mock('@/components/meal-plan/WorkingDraftRecovery', () => ({ default: props => test.manual ? <button onClick={() => { void props.onResume({ draft_key: 'meal-plan:patient:55', payload: {} }); }}>Retomar teste manual</button> : null }));
vi.mock('@/components/meal-plan/PlanTargetMonitor', () => ({ default: () => null }));
vi.mock('@/components/meal-plan/NotificationCenter', () => ({ default: () => null }));
vi.mock('@/components/meal-plan/MealPlanViewer', () => ({ default: () => null }));
vi.mock('@/components/meal-plan/MealPlanList', () => ({ default: () => null }));
vi.mock('@/components/meal-plan/TemplateManagerDialog', () => ({ default: () => null }));
vi.mock('@/components/meal-plan/CopyModelDialog', () => ({ default: () => null }));
vi.mock('@/components/anamnesis/MealPlanAlertsBar', () => ({ MealPlanAlertsBar: () => null }));
vi.mock('@/components/meal-plan/MealPlanForm', () => ({ default: props => <><div data-testid="restored-plan">{JSON.stringify(props.restoredSession)}</div><button onClick={async () => { if (await props.onSubmit({})) props.onSaved(); }}>Salvar sessão</button></> }));
beforeEach(() => { test.plans = []; test.noRecovery = false; test.appliedCopy = false; test.patientId = 'patient'; test.planPending = null; test.manual = false; });
it('does not apply a manual recovery whose plan lookup finishes after changing patient', async () => {
    test.noRecovery = true; test.manual = true;
    let finish; test.planPending = new Promise(resolve => { finish = resolve; });
    const view = render(<MemoryRouter><MealPlanPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Retomar teste manual' }));
    test.patientId = 'other-patient';
    view.rerender(<MemoryRouter><MealPlanPage /></MemoryRouter>);
    await act(async () => { finish({ data: { id: 55, patient_id: 'patient', meals: [] } }); await test.planPending; });
    expect(screen.queryByTestId('restored-plan')).toBeNull();
    expect(screen.getByText('Planos Alimentares')).toBeInTheDocument();
});
it('opens the saved complete session automatically on entry, including StrictMode and delayed plan loading', async () => {
    render(<React.StrictMode><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MealPlanPage /></MemoryRouter></React.StrictMode>);
    const editor = await screen.findByTestId('restored-plan');
    expect(JSON.parse(editor.textContent)).toEqual(test.snapshot);
});
it('does not reopen an older session after a new plan was created and applied', async () => {
    test.plans = [{ id: 99, patient_id: 'patient', updated_at: '2026-10-02T21:00:00Z', is_draft: false }];
    render(<React.StrictMode><MemoryRouter><MealPlanPage /></MemoryRouter></React.StrictMode>);
    await screen.findByText('Há um plano aplicado mais recente. A edição anterior não foi reaberta automaticamente.');
    expect(screen.queryByTestId('restored-plan')).toBeNull();
    expect(screen.getByText('Planos Alimentares')).toBeInTheDocument();
});

it('returns a successfully saved session to the plan list', async () => {
    render(<MemoryRouter><MealPlanPage /></MemoryRouter>);
    await screen.findByTestId('restored-plan');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar sessão' }));
    await screen.findByText('Planos Alimentares');
    expect(screen.queryByTestId('restored-plan')).toBeNull();
});

it('shows the list on quick entry when an active plan is already saved and no session is pending', async () => {
    test.noRecovery = true;
    test.plans = [{ id: 55, is_active: true, updated_at: '2026-10-03T03:00:00Z' }];
    render(<MemoryRouter initialEntries={['/meal-plan?quick=1']}><MealPlanPage /></MemoryRouter>);
    await screen.findByText('Planos Alimentares');
    expect(screen.queryByTestId('restored-plan')).toBeNull();
});
it('closes the previous patient editor when a different patient route reuses the page', async () => {
    const view = render(<MemoryRouter><MealPlanPage /></MemoryRouter>);
    await screen.findByTestId('restored-plan');
    test.noRecovery = true; test.patientId = 'another-patient';
    view.rerender(<MemoryRouter><MealPlanPage /></MemoryRouter>);
    expect(screen.queryByTestId('restored-plan')).toBeNull();
    expect(screen.getByText('Planos Alimentares')).toBeInTheDocument();
});

it('keeps an identical applied copy from the old version in the list instead of reopening the editor', async () => {
    test.appliedCopy = true;
    render(<MemoryRouter><MealPlanPage /></MemoryRouter>);
    await screen.findByText('Esta edição já corresponde ao plano salvo. Mantivemos a listagem dos planos.');
    expect(screen.queryByTestId('restored-plan')).toBeNull();
});
