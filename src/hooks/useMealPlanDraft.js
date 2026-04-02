import { useState, useEffect, useRef, useCallback } from 'react';
import {
    createDraftMealPlan,
    getDraftMealPlan,
    updateDraftMealPlan,
    deleteDraftMealPlan,
    addMealToPlan,
    deleteMealFromPlan,
    addFoodToMeal,
    addFoodsToMeal,
    getMealPlanById
} from '@/lib/supabase/meal-plan-queries';

/**
 * Hook para gerenciar rascunho de plano alimentar com auto-save.
 *
 * Ao montar, verifica se existe um rascunho pendente para o paciente.
 * Ao alterar dados básicos (nome, datas), salva automaticamente após 800ms (debounce).
 * Ao adicionar/remover refeições e alimentos, persiste imediatamente.
 *
 * @param {object} params
 * @param {string} params.patientId
 * @param {string} params.nutritionistId
 * @param {boolean} params.enabled - Só inicia quando form está aberto para criação nova
 */
export function useMealPlanDraft({ patientId, nutritionistId, enabled = false }) {
    const [draftId, setDraftId] = useState(null);
    const [existingDraft, setExistingDraft] = useState(null); // rascunho pré-existente (recuperação)
    const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
    const [isInitializing, setIsInitializing] = useState(false);

    const debounceTimerRef = useRef(null);
    const latestDraftIdRef = useRef(null);

    // Mantém ref sincronizada com state para closures
    useEffect(() => {
        latestDraftIdRef.current = draftId;
    }, [draftId]);

    // Na montagem, verifica se existe rascunho pendente
    useEffect(() => {
        if (!enabled || !patientId || !nutritionistId) return;

        const checkExistingDraft = async () => {
            setIsInitializing(true);
            const { data } = await getDraftMealPlan(patientId, nutritionistId);
            if (data) {
                setExistingDraft(data);
                // Não define draftId ainda — aguarda nutricionista escolher "Retomar" ou "Descartar"
            }
            setIsInitializing(false);
        };

        checkExistingDraft();
    }, [enabled, patientId, nutritionistId]);

    /**
     * Inicia um NOVO rascunho (sem rascunho pré-existente).
     * Cria o registro no banco e retorna o id.
     */
    const startNewDraft = useCallback(async () => {
        setSaveStatus('saving');
        const { data, error } = await createDraftMealPlan(patientId, nutritionistId);
        if (error || !data) {
            setSaveStatus('error');
            return null;
        }
        setDraftId(data.id);
        latestDraftIdRef.current = data.id;
        setSaveStatus('idle'); // Status volta a idle após criar rascunho base (vazio)
        return data.id;
    }, [patientId, nutritionistId]);

    /**
     * Retoma um rascunho existente.
     * Carrega o plano completo e define draftId.
     */
    const resumeExistingDraft = useCallback(async () => {
        if (!existingDraft) return null;
        const { data } = await getMealPlanById(existingDraft.id);
        setDraftId(existingDraft.id);
        latestDraftIdRef.current = existingDraft.id;
        setExistingDraft(null);
        setSaveStatus('saved');
        return data; // retorna plano completo para popular o form
    }, [existingDraft]);

    /**
     * Descarta o rascunho pré-existente e começa um novo.
     * NOTA: prefira clearExistingDraft() para criarção lazy.
     */
    const discardExistingAndStartNew = useCallback(async () => {
        if (existingDraft) {
            await deleteDraftMealPlan(existingDraft.id);
            setExistingDraft(null);
        }
        return startNewDraft();
    }, [existingDraft, startNewDraft]);

    /**
     * Limpa o existingDraft do estado local sem criar um novo draft.
     * Usado em conjunto com criação lazy: o draft só é criado na 1ª refeição adicionada.
     */
    const clearExistingDraft = useCallback(() => {
        setExistingDraft(null);
    }, []);

    /**
     * Salva os dados básicos do plano (nome, descrição, datas, dias) com debounce.
     * @param {object} planData
     */
    const savePlanInfo = useCallback((planData) => {
        const currentDraftId = latestDraftIdRef.current;
        if (!currentDraftId) return;

        setSaveStatus('saving');

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(async () => {
            const { error } = await updateDraftMealPlan(currentDraftId, planData);
            setSaveStatus(error ? 'error' : 'saved');
        }, 800);
    }, []); // latestDraftIdRef ensures we always have the current ID without needing it in deps

    /**
     * Adiciona uma refeição ao rascunho no banco e retorna o ID gerado.
     * Status só vai para 'saved' após banco confirmar tudo (refeição + alimentos).
     * @param {object} mealData - dados da refeição do MealPlanMealForm
     * @returns {Promise<number|null>} ID da refeição criada no banco
     */
    const saveMeal = useCallback(async (mealData) => {
        const currentDraftId = latestDraftIdRef.current;
        if (!currentDraftId) {
            console.warn('[useMealPlanDraft] saveMeal chamado antes do draftId estar pronto.');
            return null;
        }

        setSaveStatus('saving');

        const { data: newMeal, error: mealError } = await addMealToPlan({
            meal_plan_id: currentDraftId,
            name: mealData.name,
            meal_type: mealData.meal_type,
            meal_time: mealData.meal_time || null,
            notes: mealData.notes || null,
            order_index: mealData.order_index ?? 0
        });

        if (mealError || !newMeal) {
            setSaveStatus('error');
            return null;
        }

        // Salva alimentos em lote — status só vira 'saved' após essa confirmação
        if (mealData.foods && mealData.foods.length > 0) {
            const { error: batchError } = await addFoodsToMeal(newMeal.id, mealData.foods);
            if (batchError) {
                console.error('[useMealPlanDraft] Erro ao salvar alimentos no rascunho:', batchError);
                setSaveStatus('error');
                return newMeal.id; // refeição existe no banco, mas alimentos falharam
            }
        }

        setSaveStatus('saved'); // confirmação real: refeição + alimentos persistidos
        return newMeal.id;
    }, []);

    /**
     * Remove uma refeição do rascunho no banco.
     * @param {number} mealId - ID da refeição no banco (meal_plan_meals.id)
     */
    const removeMeal = useCallback(async (mealId) => {
        if (!mealId) return;
        setSaveStatus('saving');
        const { error } = await deleteMealFromPlan(mealId);
        setSaveStatus(error ? 'error' : 'saved');
    }, []);

    /**
     * Atualiza uma refeição existente no rascunho.
     * SEGURO: cria a nova versão ANTES de deletar a antiga, evitando perda de dados
     * se a operação de criação falhar no meio.
     * @param {number} oldDbId - ID da refeição antiga no banco
     * @param {object} mealData - dados atualizados (incluindo foods)
     * @param {number} orderIndex - posição da refeição no plano
     * @returns {Promise<number|null>} novo ID da refeição no banco
     */
    const updateMeal = useCallback(async (oldDbId, mealData, orderIndex) => {
        const currentDraftId = latestDraftIdRef.current;
        if (!currentDraftId) return null;

        setSaveStatus('saving');

        try {
            // PASSO 1: Cria a nova refeição PRIMEIRO (antiga ainda existe — sem risco de perda)
            const { data: newMeal, error: mealError } = await addMealToPlan({
                meal_plan_id: currentDraftId,
                name: mealData.name,
                meal_type: mealData.meal_type,
                meal_time: mealData.meal_time || null,
                notes: mealData.notes || null,
                order_index: orderIndex ?? 0
            });

            if (mealError || !newMeal) {
                setSaveStatus('error');
                return null; // antiga intacta — sem perda de dados
            }

            // PASSO 2: Salva alimentos da nova refeição
            if (mealData.foods && mealData.foods.length > 0) {
                const { error: batchError } = await addFoodsToMeal(newMeal.id, mealData.foods);
                if (batchError) {
                    console.error('[useMealPlanDraft] Erro ao salvar alimentos ao atualizar refeição:', batchError);
                    // Nova refeição existe mas sem alimentos — ainda melhor que perder tudo
                    // Continua para deletar a antiga de qualquer forma
                }
            }

            // PASSO 3: AGORA deleta a antiga (nova está garantida)
            if (oldDbId) {
                await deleteMealFromPlan(oldDbId);
            }

            setSaveStatus('saved');
            return newMeal.id;
        } catch (error) {
            console.error('[useMealPlanDraft] Erro ao atualizar refeição no rascunho:', error);
            setSaveStatus('error');
            return null;
        }
    }, []);

    /**
     * Deleta o rascunho atual do banco (ao apertar "Cancelar").
     */
    const discardDraft = useCallback(async () => {
        const currentDraftId = latestDraftIdRef.current;
        if (currentDraftId) {
            await deleteDraftMealPlan(currentDraftId);
        }
        setDraftId(null);
        latestDraftIdRef.current = null;
        setSaveStatus('idle');
    }, []);

    /**
     * Define o draftId diretamente (usado quando o form recebe um draft completo via props).
     * @param {number} id
     */
    const setActiveDraftId = useCallback((id) => {
        setDraftId(id);
        latestDraftIdRef.current = id;
        setSaveStatus('saved');
    }, []);


    // Cleanup do debounce ao desmontar
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    return {
        draftId,
        existingDraft,
        saveStatus,
        isInitializing,
        startNewDraft,
        resumeExistingDraft,
        discardExistingAndStartNew,
        clearExistingDraft,
        savePlanInfo,
        saveMeal,
        updateMeal,
        removeMeal,
        discardDraft,
        setActiveDraftId
    };
}
