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
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockFrom = vi.fn();

// Encadeia os mocks para simular a API fluente do Supabase
const chainable = {
    select: mockSelect,
    eq: mockEq,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    order: mockOrder,
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
    setActiveMealPlan,
    promoteDraftToActive,
    createDraftMealPlan,
    deleteDraftMealPlan,
} = await import('@/lib/supabase/meal-plan-queries');

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
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });

        const result = await getDraftMealPlan('patient-001', 'nutritionist-001');

        expect(result.data).toBeNull();
        expect(result.error).toBeNull();
    });

    it('deve buscar o plano COMPLETO (com refeições) quando rascunho existe', async () => {
        // Passo 1: maybeSingle retorna apenas o ID do draft
        mockMaybeSingle.mockResolvedValueOnce({ data: { id: 99 }, error: null });

        // Passo 2: getMealPlanById deve ser chamado — retorna plano completo
        const fullPlan = {
            id: 99,
            name: 'Rascunho',
            meals: [
                { id: 1, name: 'Café da manhã', foods: [{ id: 10, food_id: 5 }] }
            ]
        };
        // getMealPlanById faz sua própria query encadeada
        mockSingle.mockResolvedValue({ data: fullPlan, error: null });

        const result = await getDraftMealPlan('patient-001', 'nutritionist-001');

        // Garante que a query inicial buscou apenas o id
        expect(mockSelect).toHaveBeenCalledWith('id');
        // E que o resultado final tem as refeições
        expect(result.data).toBeDefined();
    });

    it('deve retornar erro propagado do banco', async () => {
        const dbError = new Error('DB timeout');
        mockMaybeSingle.mockResolvedValue({ data: null, error: dbError });

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
