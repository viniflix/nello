import { useDraftGuard } from './useDraftGuard';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    createDraftMealPlan,
    getDraftMealPlan,
    updateDraftMealPlan,
    deleteDraftMealPlan,
    saveDraftMeal,
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
    useDraftGuard(['local','saving','error','conflict'].includes(saveStatus));

    const debounceTimerRef = useRef(null);
    const latestDraftIdRef = useRef(null);
    const pendingPlanInfoRef = useRef(null);
    const writeChainRef = useRef(Promise.resolve(true));
    const revisionRef = useRef(null);
    const scopeRef = useRef(0);

    const flushPlanInfo = useCallback(() => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        const pending = pendingPlanInfoRef.current;
        if (!pending) return writeChainRef.current;
        pendingPlanInfoRef.current = null;
        const scope = scopeRef.current;
        writeChainRef.current = writeChainRef.current.catch(() => false).then(async () => {
            try {
                if (scope !== scopeRef.current) return false;
                setSaveStatus('saving');
                const { data, error } = await updateDraftMealPlan(pending.draftId, pending.data, revisionRef.current);
                if (scope !== scopeRef.current) return false;
                if (error || !data) {
                    pendingPlanInfoRef.current = pendingPlanInfoRef.current || pending;
                    setSaveStatus(error?.code === 'PT409' ? 'conflict' : 'error');
                    return false;
                }
                revisionRef.current = data.updated_at;
                if (!pendingPlanInfoRef.current) setSaveStatus('saved');
                return true;
            } catch {
                if (scope !== scopeRef.current) return false;
                pendingPlanInfoRef.current = pendingPlanInfoRef.current || pending;
                setSaveStatus('error');
                return false;
            }
        });
        return writeChainRef.current;
    }, []);

    // Mantém ref sincronizada com state para closures
    useEffect(() => {
        latestDraftIdRef.current = draftId;
    }, [draftId]);

    // A screen/identity transition cancels pending writes; never flush on unmount.
    useEffect(() => {
        const scope = ++scopeRef.current;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        pendingPlanInfoRef.current = null;
        latestDraftIdRef.current = null;
        revisionRef.current = null;
        writeChainRef.current = Promise.resolve(true);
        setDraftId(null);setExistingDraft(null);setSaveStatus('idle');setIsInitializing(false);
        if (enabled && patientId && nutritionistId) {
            setIsInitializing(true);
            void getDraftMealPlan(patientId, nutritionistId).then(({data,error}) => {
                if (scope !== scopeRef.current) return;
                if (error) setSaveStatus('error');
                if (data) setExistingDraft(data);
                setIsInitializing(false);
            });
        }
        return () => {
            scopeRef.current = scope + 1;
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            pendingPlanInfoRef.current = null;
            latestDraftIdRef.current = null;
        };
    }, [enabled, patientId, nutritionistId]);

    /**
     * Inicia um NOVO rascunho (sem rascunho pré-existente).
     * Cria o registro no banco e retorna o id.
     */
    const startNewDraft = useCallback(async () => {
        const scope = scopeRef.current;
        setSaveStatus('saving');
        const { data, error } = await createDraftMealPlan(patientId, nutritionistId);
        if (scope !== scopeRef.current) return null;
        if (error || !data) {
            setSaveStatus('error');
            return null;
        }
        revisionRef.current = data.updated_at;
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
        const scope = scopeRef.current;
        const { data, error } = await getMealPlanById(existingDraft.id);
        if (scope !== scopeRef.current) return null;
        if (error || !data) { setSaveStatus('error'); return null; }
        revisionRef.current = data?.updated_at;
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
        const scope = scopeRef.current;
        if (existingDraft) {
            const { error } = await deleteDraftMealPlan(existingDraft.id);
            if (scope !== scopeRef.current) return null;
            if (error) { setSaveStatus('error'); return null; }
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

        setSaveStatus('local');

        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        pendingPlanInfoRef.current = { draftId: currentDraftId, data: planData };
        debounceTimerRef.current = setTimeout(() => { void flushPlanInfo(); }, 800);
    }, [flushPlanInfo]);

    // Serialize header and meal writes against the same confirmed plan revision.
    const persistMeal = useCallback(async (mealId, mealData) => {
        const currentDraftId = latestDraftIdRef.current;
        if (!currentDraftId) return null;
        const scope = scopeRef.current;
        const headersSaved = await flushPlanInfo();
        if (scope !== scopeRef.current || !headersSaved) return null;
        setSaveStatus('saving');
        const { data, error } = await saveDraftMeal(currentDraftId, mealId, mealData, revisionRef.current);
        if (scope !== scopeRef.current) return null;
        if (error || !data) {
            setSaveStatus(error?.code === 'PT409' ? 'conflict' : 'error');
            return null;
        }
        revisionRef.current = data.plan_revision;
        setSaveStatus(pendingPlanInfoRef.current ? 'local' : 'saved');
        return data.id;
    }, [flushPlanInfo]);

    const saveMeal = useCallback(async mealData => {
        if (!latestDraftIdRef.current) {
            logDiagnostic('warn', 'hooks/useMealPlanDraft.js:158', 'Draft not initialized');
            return null;
        }
        return persistMeal(null, mealData);
    }, [persistMeal]);

    const updateMeal = useCallback((oldDbId, mealData, orderIndex) =>
        persistMeal(oldDbId, { ...mealData, order_index: orderIndex ?? 0 }), [persistMeal]);

    const removeMeal = useCallback(async mealId => {
        if (!mealId) return false;
        const scope = scopeRef.current;
        if (!await flushPlanInfo() || scope !== scopeRef.current) return false;
        setSaveStatus('saving');
        const { data, error } = await saveDraftMeal(latestDraftIdRef.current, mealId, {delete:true}, revisionRef.current);
        if (scope !== scopeRef.current) return false;
        if (!error && data) revisionRef.current = data.plan_revision;
        setSaveStatus(error?.code === 'PT409' ? 'conflict' : error || !data ? 'error' : 'saved');
        return !error && !!data;
    }, [flushPlanInfo]);

    /**
     * Deleta o rascunho atual do banco (ao apertar "Cancelar").
     */
    const discardDraft = useCallback(async () => {
        const scope = scopeRef.current;
        const currentDraftId = latestDraftIdRef.current;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        pendingPlanInfoRef.current = null;
        await writeChainRef.current.catch(() => false);
        if (scope !== scopeRef.current) return false;
        if (currentDraftId) {
            const { error } = await deleteDraftMealPlan(currentDraftId);
            if (scope !== scopeRef.current) return false;
            if (error) { setSaveStatus('error'); return false; }
        }
        setDraftId(null);
        latestDraftIdRef.current = null;
        setSaveStatus('idle');
    }, []);

    /**
     * Define o draftId diretamente (usado quando o form recebe um draft completo via props).
     * @param {number} id
     */
    const setActiveDraftId = useCallback((id, serverPlan) => {
        revisionRef.current = serverPlan?.updated_at;
        setDraftId(id);
        latestDraftIdRef.current = id;
        setSaveStatus('saved');
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
        flushPlanInfo,
        saveMeal,
        updateMeal,
        removeMeal,
        discardDraft,
        setActiveDraftId
    };
}
