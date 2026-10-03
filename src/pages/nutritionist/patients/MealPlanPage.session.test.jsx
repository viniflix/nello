import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import MealPlanPage from './MealPlanPage';
const test = vi.hoisted(() => ({ snapshot: { kind: 'meal-plan-session', version: 1, planId: 55, formData: { name: 'Sessão interrompida' }, meals: [{ foods: [{ quantity: 33 }] }], editor: { open: true, state: { formData: { notes: 'Refeição incompleta' } } } } }));
vi.mock('@/hooks/useResolvedPatientId', () => ({ useResolvedPatientId: () => ({ patientId: 'patient', paramValue: 'patient' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'owner' } }) }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } } }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/hooks/useMealPlan', () => ({ useMealPlan: () => ({ plans: [], activePlan: null, pendingDrafts: [], loading: false, isFetching: false }) }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getMealPlanById: async () => { await new Promise(resolve => setTimeout(resolve, 5)); return { data: { id: 55, patient_id: 'patient', is_draft: false, meals: [] } }; } }));
vi.mock('@/hooks/useMealPlanSession', async () => {
    const React = await import('react');
    return { isMealPlanSession: value => value?.kind === 'meal-plan-session', useMealPlanSession: () => {
        const [recovery, setRecovery] = React.useState({ source: 'cloud', payload: test.snapshot });
        return { ready: true, recovery, restore: () => { setRecovery(null); return test.snapshot; }, discard: async () => true };
    } };
});
vi.mock('@/hooks/useMealPlanController', async () => {
    const React = await import('react');
    return { useMealPlanController: () => {
        const [showForm, setShowForm] = React.useState(false);
        const [editingPlan, setEditingPlan] = React.useState(null);
        const [pendingDraft, setPendingDraft] = React.useState(null);
        return { showForm, setShowForm, editingPlan, setEditingPlan, pendingDraft, setPendingDraft };
    } };
});
vi.mock('@/components/meal-plan/WorkingDraftRecovery', () => ({ default: () => null }));
vi.mock('@/components/meal-plan/MealPlanForm', () => ({ default: props => <div data-testid="restored-plan">{JSON.stringify(props.restoredSession)}</div> }));
it('opens the saved complete session automatically on entry, including StrictMode and delayed plan loading', async () => {
    render(<React.StrictMode><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><MealPlanPage /></MemoryRouter></React.StrictMode>);
    const editor = await screen.findByTestId('restored-plan');
    expect(JSON.parse(editor.textContent)).toEqual(test.snapshot);
});
