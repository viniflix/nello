/**
 * Testes unitários para meal-plan-queries.js
 * Foca nos fluxos críticos de negócio: draft, ativação e promoção de planos.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock do Supabase client ─────────────────────────────────────────────────
const mockRpc = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockOrder = vi.fn();
const mockRange = vi.fn();
const mockLimit = vi.fn();
const mockFrom = vi.fn();

// Encadeia os mocks para simular a API fluente do Supabase
const chainable = {
    select: mockSelect,
    eq: mockEq,
    in: mockIn,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    order: mockOrder,
    range: mockRange,
    limit: mockLimit,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
};

Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));

vi.mock('@/lib/customSupabaseClient', () => ({
    supabase: {
        from: mockFrom.mockReturnValue(chainable),
        rpc: mockRpc,
        auth: {
            getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'ntr-001' } } }),
        },
    },
}));

// ─── Import after mock ────────────────────────────────────────────────────────
const {
    getDraftMealPlan,
    getDraftMealPlans,
    setActiveMealPlan,
    promoteDraftToActive,
    deleteDraftMealPlan,
    addMealToPlan,
    updateFullMealPlan,
    archiveMealPlan,
    createMealPlan,
    copyMealPlanToPatient,
} = await import('@/lib/supabase/meal-plan-queries');

describe('D6-D8 — plano clínico atômico e auditável', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFrom.mockReturnValue(chainable);
        Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
    });

    it('envia estratégia, dias e motivo para o versionamento transacional do servidor', async () => {
        mockRpc.mockResolvedValue({ data: { status: 'success', version_number: 2 }, error: null });
        mockSingle.mockResolvedValue({ data: { id: 42, plan_mode: 'qualitative', meals: [] }, error: null });
        mockIn.mockResolvedValueOnce({ data: [{ id: 42, plan_mode: 'qualitative' }], error: null });
        mockRange.mockResolvedValueOnce({ data: [], error: null });

        const result = await updateFullMealPlan(42, {
            name: 'Plano flexível', start_date: '2026-08-13', active_days: ['monday'],
            plan_mode: 'qualitative', change_reason: 'Ajuste clínico após retorno', meals: [],
        });

        expect(result.error).toBeNull();
        expect(mockRpc).toHaveBeenCalledWith('upsert_full_meal_plan', expect.objectContaining({
            p_plan_id: 42,
            p_plan_data: expect.objectContaining({
                plan_mode: 'qualitative', active_days: ['monday'],
                change_reason: 'Ajuste clínico após retorno',
            }),
        }));
        expect(mockFrom).not.toHaveBeenCalledWith('meal_plan_versions');
    });

    it('arquiva pelo contrato auditável em vez de atualizar ou apagar diretamente', async () => {
        mockRpc.mockResolvedValue({ data: { id: 42, status: 'archived' }, error: null });
        const result = await archiveMealPlan(42, 'Encerramento confirmado pelo profissional');
        expect(result.error).toBeNull();
        expect(mockRpc).toHaveBeenCalledWith('archive_meal_plan', {
            p_plan_id: 42, p_reason: 'Encerramento confirmado pelo profissional',
        });
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockDelete).not.toHaveBeenCalled();
    });

    it('cria o plano e troca o ativo na mesma transação do servidor', async () => {
        mockRpc.mockResolvedValue({ data: 77, error: null });
        mockSingle.mockResolvedValue({ data: { id: 77, is_active: false }, error: null });
        const result = await createMealPlan({ patient_id: 'patient', nutritionist_id: 'nutritionist', name: 'Novo plano', is_active: false });
        expect(result.data.id).toBe(77);
        expect(mockRpc).toHaveBeenCalledWith('create_meal_plan_atomic', {
            p_plan_data: expect.objectContaining({ name: 'Novo plano', is_active: false }),
        });
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockInsert).not.toHaveBeenCalled();
    });

    it('não cria um plano parcial quando a cópia atômica falha', async () => {
        mockRpc.mockResolvedValue({ data: null, error: new Error('source_plan_food_unavailable') });
        const result = await copyMealPlanToPatient(42, 'patient');
        expect(result.data).toBeNull();
        expect(mockRpc).toHaveBeenCalledWith('copy_meal_plan_to_patient_atomic', {
            p_source_plan_id: 42, p_target_patient_id: 'patient', p_name: null,
        });
        expect(mockInsert).not.toHaveBeenCalled();
    });
});

describe('addMealToPlan - validação de horário', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFrom.mockReturnValue(chainable);
        Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
    });

    it('bloqueia horário incompleto antes de enviar ao Supabase', async () => {
        const result = await addMealToPlan({
            meal_plan_id: 10,
            name: 'Café da manhã',
            meal_type: 'breakfast',
            meal_time: '1',
            order_index: 0,
        });

        expect(result.data).toBeNull();
        expect(result.error?.code).toBe('MEAL_TIME_INVALID');
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it('normaliza segundos antes de persistir um horário válido', async () => {
        mockSingle.mockResolvedValue({ data: { id: 50 }, error: null });

        await addMealToPlan({
            meal_plan_id: 10,
            name: 'Almoço',
            meal_type: 'lunch',
            meal_time: '12:30:00',
            order_index: 1,
        });

        expect(mockInsert).toHaveBeenCalledWith([
            expect.objectContaining({ meal_time: '12:30' }),
        ]);
    });
});

// ─── Testes ────────────────────────────────────────────────────────────────────

describe('setActiveMealPlan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFrom.mockReturnValue(chainable);
        Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
    });

    it('deve chamar a RPC set_active_meal_plan com o planId correto', async () => {
        mockRpc.mockResolvedValue({ error: null });
        mockSingle.mockResolvedValue({ data: { id: 42, is_active: true }, error: null });

        await setActiveMealPlan(42);

        expect(mockRpc).toHaveBeenCalledWith('set_active_meal_plan', { p_plan_id: 42 });
    });

    it('deve retornar o plano atualizado após chamada RPC bem-sucedida', async () => {
        const mockPlan = { id: 42, is_active: true, name: 'Plano Teste' };
        mockRpc.mockResolvedValue({ error: null });
        mockSingle.mockResolvedValue({ data: mockPlan, error: null });

        const result = await setActiveMealPlan(42);

        expect(result.error).toBeNull();
        expect(result.data).toEqual(mockPlan);
    });

    it('deve retornar erro se a RPC falhar — sem dois UPDATEs separados', async () => {
        const rpcError = new Error('RPC failure');
        mockRpc.mockResolvedValue({ error: rpcError });

        const result = await setActiveMealPlan(42);

        expect(result.error).toBeDefined();
        expect(result.data).toBeNull();
        // Garante que não tentou fazer UPDATE direto na tabela
        expect(mockFrom).not.toHaveBeenCalledWith('meal_plans');
    });

    it('NÃO deve executar dois UPDATEs sequenciais (evita race condition)', async () => {
        mockRpc.mockResolvedValue({ error: null });
        mockSingle.mockResolvedValue({ data: { id: 1 }, error: null });

        await setActiveMealPlan(1);

        // O update direto via .from().update() não deve ter sido chamado
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

describe('promoteDraftToActive', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFrom.mockReturnValue(chainable);
        Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
    });

    it('deve chamar a RPC promote_draft_to_active com os parâmetros corretos', async () => {
        mockRpc.mockResolvedValue({ error: null });
        mockSingle.mockResolvedValue({ data: { id: 10, is_draft: false, is_active: true }, error: null });

        await promoteDraftToActive(10, 'patient-uuid-123');

        expect(mockRpc).toHaveBeenCalledWith('promote_draft_to_active', {
            p_draft_id: 10,
            p_patient_id: 'patient-uuid-123',
        });
    });

    it('deve retornar o plano promovido após operação bem-sucedida', async () => {
        const mockPlan = { id: 10, is_draft: false, is_active: true };
        mockRpc.mockResolvedValue({ error: null });
        mockSingle.mockResolvedValue({ data: mockPlan, error: null });

        const result = await promoteDraftToActive(10, 'patient-uuid-123');

        expect(result.error).toBeNull();
        expect(result.data.is_draft).toBe(false);
        expect(result.data.is_active).toBe(true);
    });

    it('deve retornar erro se a RPC falhar', async () => {
        const rpcError = new Error('promote RPC failure');
        mockRpc.mockResolvedValue({ error: rpcError });

        const result = await promoteDraftToActive(10, 'patient-uuid-123');

        expect(result.error).toBeDefined();
        expect(result.data).toBeNull();
    });
});

describe('getDraftMealPlan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFrom.mockReturnValue(chainable);
        Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
    });

    it('deve retornar null se não existir rascunho para o paciente', async () => {
        mockRange.mockResolvedValue({ data: [], error: null });

        const result = await getDraftMealPlan('patient-001', 'nutritionist-001');

        expect(result.data).toBeNull();
        expect(result.error).toBeNull();
    });

    it('monta vários rascunhos completos com uma consulta por tabela', async () => {
        mockRange
            .mockResolvedValueOnce({ data: [{ id: 99, name: 'Primeiro' }, { id: 100, name: 'Segundo' }], error: null })
            .mockResolvedValueOnce({ data: [
                { id: 1, meal_plan_id: 99, name: 'Café' },
                { id: 2, meal_plan_id: 100, name: 'Almoço' },
            ], error: null })
            .mockResolvedValueOnce({ data: [], error: null });

        const result = await getDraftMealPlans('patient-001', 'nutritionist-001');

        expect(result.error).toBeNull();
        expect(result.data.map(plan => [plan.id, plan.meals[0]?.name])).toEqual([
            [99, 'Café'], [100, 'Almoço'],
        ]);
        expect(mockFrom.mock.calls.map(([table]) => table)).toEqual([
            'meal_plans', 'meal_plan_meals', 'meal_plan_foods',
        ]);
    });

    it('deve retornar erro propagado do banco', async () => {
        const dbError = new Error('DB timeout');
        mockRange.mockResolvedValue({ data: null, error: dbError });

        const result = await getDraftMealPlan('patient-001', 'nutritionist-001');

        expect(result.error).toBeDefined();
        expect(result.data).toBeNull();
    });
});

describe('deleteDraftMealPlan', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFrom.mockReturnValue(chainable);
        Object.values(chainable).forEach((fn) => fn.mockReturnValue(chainable));
    });

    it('deve retornar { data, error: null } se a deleção for bem-sucedida', async () => {
        // O delete encadeia 3 eq(). O último deve resolver a promise.
        mockEq
            .mockReturnValueOnce(chainable)
            .mockReturnValueOnce(chainable)
            .mockResolvedValueOnce({ error: null });

        const result = await deleteDraftMealPlan(5);

        expect(result.error).toBeNull();
    });

    it('deve retornar { data: null, error } se a deleção falhar', async () => {
        const dbError = new Error('delete failed');
        mockEq
            .mockReturnValueOnce(chainable)
            .mockReturnValueOnce(chainable)
            .mockResolvedValueOnce({ error: dbError });

        const result = await deleteDraftMealPlan(5);

        expect(result.error).toBeDefined();
    });
});
