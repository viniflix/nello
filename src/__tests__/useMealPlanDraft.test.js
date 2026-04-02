/**
 * Testes unitários para useMealPlanDraft hook.
 * Foca em: guards de segurança, ordem de operações no updateMeal,
 * e confirmação de status apenas após persistência real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockCreateDraft = vi.fn();
const mockGetDraft = vi.fn();
const mockUpdateDraft = vi.fn();
const mockDeleteDraft = vi.fn();
const mockAddMeal = vi.fn();
const mockDeleteMeal = vi.fn();
const mockAddFoodsToMeal = vi.fn();
const mockGetMealPlanById = vi.fn();

vi.mock('@/lib/supabase/meal-plan-queries', () => ({
    createDraftMealPlan: mockCreateDraft,
    getDraftMealPlan: mockGetDraft,
    updateDraftMealPlan: mockUpdateDraft,
    deleteDraftMealPlan: mockDeleteDraft,
    addMealToPlan: mockAddMeal,
    deleteMealFromPlan: mockDeleteMeal,
    addFoodToMeal: vi.fn(),
    addFoodsToMeal: mockAddFoodsToMeal,
    getMealPlanById: mockGetMealPlanById,
}));

const { useMealPlanDraft } = await import('@/hooks/useMealPlanDraft');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const defaultParams = {
    patientId: 'patient-001',
    nutritionistId: 'nutritionist-001',
    enabled: true,
};

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('useMealPlanDraft — inicialização', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('deve iniciar com draftId null quando enabled = false', () => {
        mockGetDraft.mockResolvedValue({ data: null, error: null });

        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: false })
        );

        expect(result.current.draftId).toBeNull();
        expect(mockGetDraft).not.toHaveBeenCalled();
    });

    it('startNewDraft deve criar rascunho e definir draftId', async () => {
        mockGetDraft.mockResolvedValue({ data: null, error: null });
        mockCreateDraft.mockResolvedValue({ data: { id: 55 }, error: null });

        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: false })
        );

        await act(async () => {
            await result.current.startNewDraft();
        });

        expect(mockCreateDraft).toHaveBeenCalledWith('patient-001', 'nutritionist-001');
        expect(result.current.draftId).toBe(55);
    });

    it('deve detectar rascunho existente no banco ao montar com enabled=true', async () => {
        const existingDraft = { id: 77, name: 'Rascunho', meals: [] };
        mockGetDraft.mockResolvedValue({ data: existingDraft, error: null });

        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: true })
        );

        // Aguarda a inicialização async
        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });

        expect(result.current.existingDraft).toEqual(existingDraft);
        expect(result.current.draftId).toBeNull(); // Não define draftId até o usuário escolher "Retomar"
    });
});

describe('useMealPlanDraft — saveMeal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDraft.mockResolvedValue({ data: null, error: null });
    });

    it('deve retornar null e logar warning se draftId for null', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: false })
        );

        let returnValue;
        await act(async () => {
            returnValue = await result.current.saveMeal({
                name: 'Almoço',
                meal_type: 'lunch',
                foods: [],
            });
        });

        expect(returnValue).toBeNull();
        expect(mockAddMeal).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('[useMealPlanDraft] saveMeal chamado antes do draftId estar pronto')
        );

        warnSpy.mockRestore();
    });

    it('deve salvar refeição e retornar ID após banco confirmar', async () => {
        mockCreateDraft.mockResolvedValue({ data: { id: 10 }, error: null });
        mockAddMeal.mockResolvedValue({ data: { id: 201 }, error: null });
        mockAddFoodsToMeal.mockResolvedValue({ data: [], error: null });

        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: false })
        );

        // Primeiro inicia o draft
        await act(async () => {
            await result.current.startNewDraft();
        });

        let mealId;
        await act(async () => {
            mealId = await result.current.saveMeal({
                name: 'Almoço',
                meal_type: 'lunch',
                foods: [{ food_id: 5, quantity: 100 }],
            });
        });

        expect(mealId).toBe(201);
        expect(result.current.saveStatus).toBe('saved');
    });

    it('deve definir status "error" se addFoodsToMeal falhar — não "saved"', async () => {
        mockCreateDraft.mockResolvedValue({ data: { id: 10 }, error: null });
        mockAddMeal.mockResolvedValue({ data: { id: 201 }, error: null });
        mockAddFoodsToMeal.mockResolvedValue({ error: new Error('batch failed') });

        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: false })
        );

        await act(async () => { await result.current.startNewDraft(); });

        await act(async () => {
            await result.current.saveMeal({
                name: 'Jantar',
                meal_type: 'dinner',
                foods: [{ food_id: 7, quantity: 200 }],
            });
        });

        // CRÍTICO: status deve ser 'error', não 'saved'
        expect(result.current.saveStatus).toBe('error');
    });
});

describe('useMealPlanDraft — updateMeal (create-before-delete)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDraft.mockResolvedValue({ data: null, error: null });
        mockCreateDraft.mockResolvedValue({ data: { id: 10 }, error: null });
    });

    it('deve criar nova refeição ANTES de deletar a antiga', async () => {
        const callOrder = [];
        mockAddMeal.mockImplementation(async () => {
            callOrder.push('ADD');
            return { data: { id: 301 }, error: null };
        });
        mockAddFoodsToMeal.mockResolvedValue({ data: [], error: null });
        mockDeleteMeal.mockImplementation(async () => {
            callOrder.push('DELETE');
            return { error: null };
        });

        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: false })
        );

        await act(async () => { await result.current.startNewDraft(); });

        await act(async () => {
            await result.current.updateMeal(99, {
                name: 'Almoço Editado',
                meal_type: 'lunch',
                foods: [],
            }, 0);
        });

        // ADD deve vir ANTES de DELETE — esta é a garantia central contra perda de dados
        expect(callOrder.indexOf('ADD')).toBeLessThan(callOrder.indexOf('DELETE'));
        expect(callOrder).toEqual(['ADD', 'DELETE']);
    });

    it('se addMealToPlan falhar, a refeição antiga deve permanecer intacta', async () => {
        mockAddMeal.mockResolvedValue({ data: null, error: new Error('create failed') });

        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: false })
        );

        await act(async () => { await result.current.startNewDraft(); });

        let returnValue;
        await act(async () => {
            returnValue = await result.current.updateMeal(99, {
                name: 'Tentativa',
                meal_type: 'lunch',
                foods: [],
            }, 0);
        });

        expect(returnValue).toBeNull();
        // DELETE não deve ter sido chamado — antiga está segura
        expect(mockDeleteMeal).not.toHaveBeenCalled();
        expect(result.current.saveStatus).toBe('error');
    });
});

describe('useMealPlanDraft — setActiveDraftId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetDraft.mockResolvedValue({ data: null, error: null });
    });

    it('deve definir draftId e status saved diretamente', async () => {
        const { result } = renderHook(() =>
            useMealPlanDraft({ ...defaultParams, enabled: false })
        );

        await act(async () => {
            result.current.setActiveDraftId(999);
        });

        expect(result.current.draftId).toBe(999);
        expect(result.current.saveStatus).toBe('saved');
    });
});
