import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TabContentNutrition from './TabContentNutrition';

const mocks = vi.hoisted(() => ({ plan: vi.fn(), diary: vi.fn(), summary: vi.fn(), navigate: vi.fn() }));
vi.mock('@/lib/supabase/meal-plan-queries', () => ({ getActiveMealPlan: mocks.plan }));
vi.mock('@/lib/supabase/food-diary-queries', () => ({ calculateDiaryAdherence: mocks.diary, getNutritionalSummary: mocks.summary }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'nutritionist' } }) }));
vi.mock('@/components/patient-hub/EnergyExpenditureSummaryCard', () => ({ default: () => <div>Gasto energético</div> }));
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal(), useNavigate: () => mocks.navigate }));

const activePlan = { id: 1, name: 'Plano atual', is_active: true, is_draft: false, prescription_status: 'finalized' };
const context = { displayedPlan: activePlan, planStatus: 'active' };
function renderTab(props = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><MemoryRouter><TabContentNutrition patientId="patient" operationalContext={context} {...props} /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
    vi.clearAllMocks();
    mocks.plan.mockResolvedValue({ data: activePlan, error: null });
    mocks.diary.mockResolvedValue({ data: { totalMeals: 0, adherencePercentage: 0, currentStreak: 0 }, error: null });
    mocks.summary.mockResolvedValue({ data: { avgCaloriesPerDay: 0 }, error: null });
});
describe('Nutrição no Hub real', () => {
    it('reutiliza o plano carregado pelo Hub sem nova consulta', async () => {
        renderTab();
        await screen.findByText('Plano atual');
        expect(mocks.plan).not.toHaveBeenCalled();
    });
    it('mostra falha de consulta no card sem alegar ausência de plano', async () => {
        const refresh = vi.fn();
        renderTab({ operationalContext: { planStatus: 'unknown' }, onRefresh: refresh });
        fireEvent.click(await screen.findByRole('button', { name: 'Recarregar plano' }));
        expect(refresh).toHaveBeenCalledOnce();
        expect(screen.queryByText('Nenhum Plano Alimentar Ativo')).not.toBeInTheDocument();
    });
    it('não oferece envio de um rascunho como plano publicado', async () => {
        renderTab({ operationalContext: { displayedPlan: { ...activePlan, is_draft: true }, planStatus: 'draft' }, onOpenChat: vi.fn() });
        expect(await screen.findByRole('button', { name: 'Enviar ao paciente' })).toBeDisabled();
    });
    it('envia pelo chat somente quando há um plano vigente e callback', async () => {
        const chat = vi.fn();
        renderTab({ onOpenChat: chat });
        fireEvent.click(await screen.findByRole('button', { name: 'Enviar ao paciente' }));
        expect(chat).toHaveBeenCalledOnce();
        expect(mocks.navigate).not.toHaveBeenCalled();
    });
    it('não transforma falha do diário em ausência de registros', async () => {
        mocks.diary.mockResolvedValue({ data: null, error: new Error('offline') });
        renderTab();
        expect(await screen.findByText('Não foi possível carregar a regularidade do diário.')).toBeInTheDocument();
        expect(screen.queryByText('Nenhum Registro Recente')).not.toBeInTheDocument();
    });
    it('mantém skeleton identificado enquanto os dados do diário carregam', async () => {
        mocks.diary.mockReturnValue(new Promise(() => {}));
        renderTab();
        await waitFor(() => expect(screen.getByRole('status', { name: 'Carregando diário alimentar' })).toBeInTheDocument());
    });
});
