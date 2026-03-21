import { useState, useEffect, useRef, useCallback } from 'react';
import {
    createDraftMealPlan,
    getDraftMealPlan,
    updateDraftMealPlan,
    deleteDraftMealPlan,
    addMealToPlan,
    deleteMealFromPlan,
    addFoodToMeal,
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
        const { data, error } = await createDraftMealPlan(patientId, nutritionistId);
        if (error || !data) {
            setSaveStatus('error');
            return null;
        }
        setDraftId(data.id);
        latestDraftIdRef.current = data.id;
        setSaveStatus('saved');
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
     */
    const discardExistingAndStartNew = useCallback(async () => {
        if (existingDraft) {
            await deleteDraftMealPlan(existingDraft.id);
            setExistingDraft(null);
        }
        return startNewDraft();
    }, [existingDraft, startNewDraft]);

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
    }, []);

    /**
     * Adiciona uma refeição ao rascunho no banco e retorna o ID gerado.
     * @param {object} mealData - dados da refeição do MealPlanMealForm
     * @returns {Promise<number|null>} ID da refeição criada no banco
     */
    const saveMeal = useCallback(async (mealData) => {
        const currentDraftId = latestDraftIdRef.current;
        if (!currentDraftId) return null;

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

        // Salvar cada alimento da refeição
        for (const food of mealData.foods || []) {
            await addFoodToMeal({
                meal_plan_meal_id: newMeal.id,
                food_id: food.food_id,
                quantity: food.quantity,
                unit: food.unit,
                calories: food.calories,
                protein: food.protein,
                carbs: food.carbs,
                fat: food.fat,
                notes: food.notes || null,
                order_index: food.order_index ?? 0
            });
        }

        setSaveStatus('saved');
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
        savePlanInfo,
        saveMeal,
        removeMeal,
        discardDraft
    };
}
