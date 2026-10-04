import { getTodayIsoDate } from '@/lib/utils/date';
import { reorderMeals, duplicateMeal, ensureMealFoodIds } from '@/lib/utils/mealEditing';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { History, FolderOpen, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormSkeleton } from '@/components/ui/custom-skeletons';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import MealPlanMealForm from './MealPlanMealForm';
import MealPlanEditorHeader from './editor/MealPlanEditorHeader';
import PlanConfiguration from './editor/PlanConfiguration';
import MealEditorList from './editor/MealEditorList';
import QuickPortionAdjustment from './editor/QuickPortionAdjustment';
import EditorNutritionPanel from './editor/EditorNutritionPanel';
import MealPlanEditorFooter from './editor/MealPlanEditorFooter';
import { workingPlanMeals, workingPlanTotals } from '@/lib/utils/mealPlanEditor';
import ImportMealFromProtocolDialog from './ImportMealFromProtocolDialog';
import { getReferenceValues, simulateMealPlanPortionAdjustment, getMealPlanById } from '@/lib/supabase/meal-plan-queries';
import { importDietTemplateMealsToPlan } from '@/lib/supabase/template-queries';
import { useMealPlanDraft } from '@/hooks/useMealPlanDraft';
import { useShadowDraft } from '@/hooks/useShadowDraft';
import { ShadowRecovery } from '@/components/ui/shadow-save-status';

const MealPlanForm = ({
    patientName,
    energyCalculation,
    energyLoading,
    energyError,
    onRetryContext,
    onRecovery,
    patientId,
    patientSlugOrId,
    nutritionistId,
    initialData = null,
    editorIntent = null,
    pendingDraft = null,   // rascunho completo já carregado pela página mãe
    recoveryDraft = null,
    beforeCloseRef = null,
    restoredSession = null,
    session = null,
    baselineAppliedAt = null,
    onSubmit,
    onSaved,
    onSaveDraft,
    onCancel,
    loading: parentLoading = false
}) => {
    const [savingAction, setSavingAction] = useState(null);
    const saveLock = useRef(false);
    const loading = parentLoading || Boolean(savingAction);
    const isEditing = Boolean(initialData?.id);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        plan_mode: 'hybrid',
        start_date: getTodayIsoDate(),
        end_date: '',
        active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    });

    const [meals, setMeals] = useState([]);
    const draggedMealRef = useRef(null);
    const [draggingMealIndex, setDraggingMealIndex] = useState(null);
    const [showMealForm, setShowMealForm] = useState(false);
    const [editingMeal, setEditingMeal] = useState(null);
    const [mealFoodTarget, setMealFoodTarget] = useState(null);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [showImportMealDialog, setShowImportMealDialog] = useState(false);
    const [errors, setErrors] = useState({});
    const [referenceValues, setReferenceValues] = useState(null);
    const [referenceError, setReferenceError] = useState(false);
    const [portionScaleFactor, setPortionScaleFactor] = useState(1);
    const [portionScope, setPortionScope] = useState('all');
    const [portionMealId, setPortionMealId] = useState('');
    const [portionFoodId, setPortionFoodId] = useState('');
    const [isResuming, setIsResuming] = useState(false);
    const shadowTouchedRef = useRef(false);
    const loadedPlanIdRef = useRef(null);
    const recoveryOpenedRef = useRef(false);
    const [nestedRecovery, setNestedRecovery] = useState(null);
    const [mealEditorState, setMealEditorState] = useState(null);
    const sessionTouchedRef = useRef(false);
    const applyingRef = useRef(false);
    const sessionRestoredRef = useRef(false);
    const intentAppliedRef = useRef(null);
    const sessionBaselineRef = useRef(restoredSession?.baselineAppliedAt ?? baselineAppliedAt);
    const receiveMealEditor = useCallback(value => { sessionTouchedRef.current = true; setMealEditorState(value); }, []);
    const shadow = useShadowDraft({
        ownerId: nutritionistId,
        draftKey: recoveryDraft?.draft_key.startsWith('meal-plan:') ? recoveryDraft.draft_key : patientId ? `meal-plan:${patientId}:${initialData?.id || 'new'}` : null,
        enabled: Boolean(patientId && nutritionistId)
    });
    const queueSession = session?.queue;
    const queueShadow = shadow.queue;

    // Draft auto-save — only active when creating a new plan (not editing)
    // enabled=false quando já temos um pendingDraft vindo da página mãe (evita double query)
    const draft = useMealPlanDraft({
        patientId,
        nutritionistId,
        enabled: !isEditing && !pendingDraft
    });
    useEffect(() => {
        if (applyingRef.current || !queueSession || !session?.ready || (!sessionTouchedRef.current && !shadowTouchedRef.current && !showMealForm)) return;
        sessionTouchedRef.current = true;
        queueSession({ formData, meals, baselineAppliedAt: sessionBaselineRef.current, planId: initialData?.id || draft.draftId || null, baseRevision: initialData?.updated_at || pendingDraft?.updated_at || null,
            editor: { open: showMealForm, mealId: editingMeal?.dbId || editingMeal?.id || editingMeal?.tempId || null, state: mealEditorState } });
    }, [queueSession, session?.ready, formData, meals, initialData?.id, initialData?.updated_at, pendingDraft?.updated_at, draft.draftId, showMealForm, editingMeal, mealEditorState]);

    useEffect(() => {
        if (!session && shadowTouchedRef.current && shadow.ready) {
            queueShadow({ formData, meals, context: { planId: initialData?.id || draft.draftId || null } });
        }
    }, [formData, meals, shadow.ready, queueShadow, initialData?.id, draft.draftId, session]);

    const restoreShadow = () => {
        const recovered = shadow.restore();
        if (!recovered) return;
        shadowTouchedRef.current = true;
        if (recovered.formData) setFormData(recovered.formData);
        if (Array.isArray(recovered.meals)) setMeals(recovered.meals.map(meal => ({ ...meal, foods: ensureMealFoodIds(meal.foods) })));
    };

    useEffect(() => {
        if (!recoveryDraft || recoveryOpenedRef.current || !shadow.ready) return;
        if (recoveryDraft.draft_key.startsWith('meal-plan:')) {
            if (!shadow.recovery) return;
            recoveryOpenedRef.current = true;
            restoreShadow();
            return;
        }
        recoveryOpenedRef.current = true;
        const mealId = recoveryDraft.payload?.context?.mealId;
        const match = mealId ? meals.find(meal => String(meal.dbId || meal.id) === String(mealId)) : null;
        setEditingMeal(match || null);
        setNestedRecovery(recoveryDraft);
        setShowMealForm(true);
    // The recovery is applied once, after the server working copy is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recoveryDraft, shadow.ready, shadow.recovery, meals]);

    // Ref para garantir auto-resume executar só uma vez
    const hasAutoResumed = useRef(false);

    // Banner de recovery: só mostra quando o usuário veio por "Novo Plano" (não por "Retomar")
    // Se pendingDraft veio como prop, o auto-resume já trata — sem mostrar o banner
    const draftToRecover = draft.existingDraft; // NÃO inclui pendingDraft aqui propositalmente

    const daysOfWeek = [
        { value: 'monday', label: 'Segunda' },
        { value: 'tuesday', label: 'Terça' },
        { value: 'wednesday', label: 'Quarta' },
        { value: 'thursday', label: 'Quinta' },
        { value: 'friday', label: 'Sexta' },
        { value: 'saturday', label: 'Sábado' },
        { value: 'sunday', label: 'Domingo' }
    ];

    // Load reference values when editing
    const loadReferenceValues = useCallback(async () => {
        const referencePlanId = initialData?.id || draft.draftId;
        if (referencePlanId) {
            const { data, error } = await getReferenceValues(referencePlanId);
            setReferenceError(Boolean(error));
            if (!error) setReferenceValues(data);
        }
    }, [initialData?.id, draft.draftId]);
    useEffect(() => { void loadReferenceValues(); }, [loadReferenceValues]);

    // Populate form when editing existing plan
    useEffect(() => {
        if (initialData && !restoredSession && loadedPlanIdRef.current !== initialData.id) {
            loadedPlanIdRef.current = initialData.id;
            setFormData({
                name: initialData.name || '',
                description: initialData.description || '',
                plan_mode: initialData.plan_mode || 'hybrid',
                start_date: initialData.start_date || getTodayIsoDate(),
                end_date: initialData.end_date || '',
                active_days: initialData.active_days || []
            });

            const mealsWithTempId = (initialData.meals || []).map((meal, idx) => ({
                ...meal,
                tempId: meal.tempId || Date.now() + idx,
                foods: (meal.foods || []).map((food, foodIdx) => ({
                    ...food,
                    tempId: food.tempId || Date.now() + idx + foodIdx + 1000
                }))
            }));

            setMeals(mealsWithTempId);
        }
    }, [initialData, loadReferenceValues, restoredSession]);

    useEffect(() => {
        if (!restoredSession || sessionRestoredRef.current) return;
        sessionRestoredRef.current = true;
        sessionTouchedRef.current = true;
        setFormData(restoredSession.formData);
        const recoveredMeals = restoredSession.meals.map(meal => ({ ...meal, foods: ensureMealFoodIds(meal.foods) }));
        setMeals(recoveredMeals);
        setMealEditorState(restoredSession.editor?.state || null);
        const mealId = restoredSession.editor?.mealId;
        setEditingMeal(mealId ? recoveredMeals.find(meal => String(meal.dbId || meal.id || meal.tempId) === String(mealId)) || null : null);
        setShowMealForm(Boolean(restoredSession.editor?.open));
    }, [restoredSession]);

    // Auto-resume quando pendingDraft é passado como prop (usuário clicou "Retomar" na listagem)
    // Não precisa clicar "Retomar" de NOVO dentro do formulário
    useEffect(() => {
        if (!pendingDraft || isEditing || hasAutoResumed.current) return;
        hasAutoResumed.current = true;
        handleResumeDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingDraft, isEditing]);

    // Quando sem pendingDraft e sem rascunho interno: não cria draft automaticamente!
    // O draft será criado LAZY, apenas quando a primeira refeição for adicionada.
    // Isso evita o bug onde "Descartar" cria um novo draft vazio que reaparece no refresh.

    // Recover meals when resuming a draft (from prop or from internal hook)
    const handleResumeDraft = async () => {
        try {
            setIsResuming(true);

            let fullPlan;
            if (pendingDraft) {
                // Draft já está completo (vindo da página mãe) — sem nova query ao banco
                fullPlan = pendingDraft;
                draft.setActiveDraftId(pendingDraft.id, pendingDraft);
            } else {
                fullPlan = await draft.resumeExistingDraft();
            }

            if (fullPlan && !restoredSession) {
                setFormData({
                    name: fullPlan.name || '',
                    description: fullPlan.description || '',
                    plan_mode: fullPlan.plan_mode || 'hybrid',
                    start_date: fullPlan.start_date || getTodayIsoDate(),
                    end_date: fullPlan.end_date || '',
                    active_days: fullPlan.active_days?.length ? fullPlan.active_days : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
                });

                const mealsWithTempId = (fullPlan.meals || []).map((meal, idx) => ({
                    ...meal,
                    tempId: `draft-meal-${meal.id}-${idx}`,
                    dbId: meal.id,
                    foods: (meal.foods || []).map((food, foodIdx) => ({
                        ...food,
                        tempId: `draft-food-${food.food_id || foodIdx}-${Date.now()}`
                    }))
                }));
                setMeals(mealsWithTempId);
            }
        } catch (error) {
            logDiagnostic('error', 'components/meal-plan/MealPlanForm.jsx:224', '[MealPlanForm] Error resuming draft:', error);
            setErrors({ recovery: 'Não foi possível recuperar o rascunho. Ele foi preservado; volte aos planos e tente novamente.' });
        } finally {
            setIsResuming(false);
        }
    };

    const handleChange = (field, value) => {
        shadowTouchedRef.current = true;
        const newData = { ...formData, [field]: value };
        setFormData(newData);
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));

        // Auto-save basic info when creating (debounced in hook)
        if (!isEditing && draft.draftId) {
            draft.savePlanInfo(newData);
        }
    };

    const handleDayToggle = (day) => {
        const newDays = formData.active_days.includes(day)
            ? formData.active_days.filter(d => d !== day)
            : [...formData.active_days, day];
        handleChange('active_days', newDays);
    };

    const handleSelectAllDays = () => {
        const newDays = formData.active_days.length === 7 ? [] : daysOfWeek.map(d => d.value);
        handleChange('active_days', newDays);
    };

    const handleSelectWeekdays = () => handleChange('active_days', ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    const handleSelectWeekends = () => handleChange('active_days', ['saturday', 'sunday']);

    const handleAddMeal = async (mealData) => {
        shadowTouchedRef.current = true;
        let activeDraftId = draft.draftId;

        // Criação LAZY: se ainda não tem draft, cria agora (na 1ª refeição)
        // Isso evita drafts vazios que reaparecem após descartar
        if (!isEditing && !activeDraftId) {
            activeDraftId = await draft.startNewDraft();
            if (!activeDraftId) {
                logDiagnostic('error', 'components/meal-plan/MealPlanForm.jsx:290', '[MealPlanForm] Não foi possível criar rascunho. Refeição não adicionada.');
                return false;
            }
        }

        const newMealData = { ...mealData, tempId: Date.now(), order_index: meals.length };

        if (!isEditing && activeDraftId) {
            // Persiste refeição + alimentos no rascunho imediatamente
            const dbMealId = await draft.saveMeal({ ...mealData, order_index: meals.length });
            if (!dbMealId) return false;
            newMealData.dbId = dbMealId;
        }

        setMeals(prev => [...prev, newMealData]);
        return true;
    };

    const handleEditMeal = (meal, foodTarget = null) => {
        setMealEditorState(null);
        setEditingMeal(meal);
        setMealFoodTarget(foodTarget);
        setShowMealForm(true);
    };

    const handleUpdateMeal = async (updatedMeal) => {
        shadowTouchedRef.current = true;
        const mealIndex = meals.findIndex(m => m.tempId === editingMeal.tempId);
        let newDbId = editingMeal.dbId || editingMeal.id;

        // Persist to DB when building a draft (not editing an existing saved plan)
        if (!isEditing && draft.draftId && draft.updateMeal) {
            newDbId = await draft.updateMeal(editingMeal.dbId, updatedMeal, mealIndex >= 0 ? mealIndex : 0);
            if (!newDbId) return false;
        }

        setMeals(prev => prev.map(m =>
            m.tempId === editingMeal.tempId
                ? { ...m, ...updatedMeal, tempId: m.tempId, dbId: newDbId ?? m.dbId }
                : m
        ));
        return true;
    };

    const handleDeleteMeal = async (meal) => {
        shadowTouchedRef.current = true;
        if (!isEditing && draft.draftId && meal.dbId) {
            const removed = await draft.removeMeal(meal.dbId);
            if (!removed) return false;
        }
        setMeals(prev => prev.filter(m => m.tempId !== meal.tempId));
        return true;
    };

    const moveMeal = (from, to) => {
        shadowTouchedRef.current = true;
        sessionTouchedRef.current = true;
        setMeals(previous => reorderMeals(previous, from, to));
    };
    const beginMealDrag = (event, index) => {
        if (event.button !== 0) return;
        event.preventDefault();
        draggedMealRef.current = { index, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDraggingMealIndex(index);
    };
    const finishMealDrag = event => {
        const gesture = draggedMealRef.current;
        draggedMealRef.current = null;
        setDraggingMealIndex(null);
        if (!gesture || gesture.pointerId !== event.pointerId || Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 8) return;
        const target = event.currentTarget.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest('[data-meal-sort-index]');
        if (target && event.currentTarget.closest('form')?.contains(target)) moveMeal(gesture.index, Number(target.dataset.mealSortIndex));
    };
    const copyMeal = index => {
        shadowTouchedRef.current = true;
        sessionTouchedRef.current = true;
        setMeals(previous => {
            const next = [...previous];
            next.splice(index+1,0,duplicateMeal(previous[index]));
            return next.map((meal,index) => ({...meal,order_index:index}));
        });
    };
    const toggleMealTotals = (index, include) => {
        shadowTouchedRef.current = true;
        sessionTouchedRef.current = true;
        setMeals(previous => previous.map((meal,i) => i===index ? {...meal,include_in_totals:include} : meal));
    };
    useEffect(() => {
        if (!editorIntent || intentAppliedRef.current === editorIntent || restoredSession || initialData?.id !== editorIntent.planId || loadedPlanIdRef.current !== initialData?.id) return;
        const index = meals.findIndex(meal => String(meal.id || meal.dbId) === String(editorIntent.mealId));
        if (editorIntent.action !== 'addMeal' && index < 0) return;
        intentAppliedRef.current = editorIntent;
        if (editorIntent.action === 'duplicate') { copyMeal(index); return; }
        if (editorIntent.action === 'addMeal') { setEditingMeal(null); setShowMealForm(true); return; }
        const meal = meals[index];
        const food = (meal.foods || []).find(item => String(item.id) === String(editorIntent.foodId));
        setEditingMeal(meal);
        setMealFoodTarget(editorIntent.action === 'addFood' ? {newFood:true} : food ? {food,substitutions:editorIntent.action === 'substitutions'} : null);
        setShowMealForm(true);
    // A contextual entry is consumed once; all writes stay in existing handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorIntent, initialData?.id, meals, restoredSession]);
    const dailyTotals = useMemo(() => workingPlanTotals(meals), [meals]);
    const calculateDailyTotals = () => dailyTotals;
    const previewMeals = useMemo(() => workingPlanMeals(meals, showMealForm ? mealEditorState : null, editingMeal), [meals, showMealForm, mealEditorState, editingMeal]);
    const previewTotals = useMemo(() => workingPlanTotals(previewMeals), [previewMeals]);
    const handleRemoveFood = async (meal, food) => {
        const foods = meal.foods.filter(item => item !== food);
        const updated = { ...meal, foods, ...workingPlanTotals([{ foods }], true) };
        if (!isEditing && draft.draftId && meal.dbId) {
            if (!(await draft.updateMeal(meal.dbId, updated, meals.indexOf(meal)))) return false;
        }
        shadowTouchedRef.current = true;
        sessionTouchedRef.current = true;
        setMeals(previous => previous.map(item => item.tempId === meal.tempId ? updated : item));
        return true;
    };

    const validate = () => {
        const newErrors = {};
        if (!formData.name.trim()) newErrors.name = 'Dê um nome ao plano';
        if (formData.active_days.length === 0) newErrors.active_days = 'Selecione pelo menos um dia da semana';
        if (!formData.start_date) newErrors.start_date = 'Data de início é obrigatória';
        if (formData.end_date && formData.end_date < formData.start_date) newErrors.end_date = 'Data final deve ser posterior à data inicial';
        if (meals.length === 0) newErrors.meals = 'Adicione pelo menos uma refeição';
        else if (meals.some(meal => !meal.foods?.length)) newErrors.meals = 'Adicione pelo menos um alimento em cada refeição antes de aplicar o plano.';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Button: "Aplicar Plano Alimentar" — promotes draft to active, or updates existing
    const savePlan = async (action, event) => {
        event.preventDefault();
        if (saveLock.current || loading) return;
        if (action === 'apply' && !validate()) return;
        if (action === 'draft' && !formData.name.trim()) {
            setErrors({ name: 'Dê um nome ao plano antes de salvar' });
            return;
        }
        saveLock.current = true;
        applyingRef.current = true;
        setSavingAction(action);
        try {
            if (!isEditing && draft.draftId && !(await draft.flushPlanInfo())) return;
            const planData = { patient_id: patientId, nutritionist_id: nutritionistId, ...formData, ...calculateDailyTotals(), meals, draftId: draft.draftId || (initialData?.is_draft ? initialData.id : null) };
            const saved = action === 'apply' ? await onSubmit(planData, initialData?.id) : await onSaveDraft?.(planData);
            if (saved) {
                sessionTouchedRef.current = false;
                shadowTouchedRef.current = false;
                sessionBaselineRef.current = saved.updated_at || saved.confirmed_at || baselineAppliedAt;
                await shadow.discard(); await session?.discard();
                onSaved?.(action);
            } else if (planData.draftId) {
                const refreshed = await getMealPlanById(planData.draftId);
                if (refreshed.data) draft.setActiveDraftId(planData.draftId, refreshed.data);
            }
        } finally { applyingRef.current = false; saveLock.current = false; setSavingAction(null); }
    };
    const handleApplyPlan = event => savePlan('apply', event);
    const handleSaveAsInactivePlan = event => savePlan('draft', event);

    // Button: "Cancelar" — discards draft and closes form
    const handleCancel = async () => {
        if (saveLock.current) return false;
        if (session && ['local', 'saving', 'error', 'conflict'].includes(session.status) && !(await session.flush())) return false;
        if (!session && ['local', 'saving', 'error', 'conflict'].includes(shadow.status) && !(await shadow.flush())) return false;
        if (!isEditing && draft.draftId && !(await draft.flushPlanInfo())) return false;
        onCancel();
        return true;
    };
    if (beforeCloseRef) beforeCloseRef.current = handleCancel;

    const mealOptions = useMemo(
        () => meals.map((meal) => ({ id: String(meal.tempId ?? meal.id), name: meal.name || 'Refeição' })),
        [meals]
    );
    const selectedMeal = useMemo(
        () => meals.find((meal) => String(meal.tempId ?? meal.id) === String(portionMealId)) || null,
        [meals, portionMealId]
    );
    const foodOptions = useMemo(
        () => (selectedMeal?.foods || []).map((food) => ({ id: String(food.tempId ?? food.id), name: food.food?.name || food.foods?.name || 'Alimento' })),
        [selectedMeal]
    );

    useEffect(() => {
        if (!mealOptions.length) { setPortionMealId(''); return; }
        if (!portionMealId || !mealOptions.some((item) => item.id === String(portionMealId))) {
            setPortionMealId(mealOptions[0].id);
        }
    }, [mealOptions, portionMealId]);

    useEffect(() => {
        if (portionScope !== 'food') return;
        if (!foodOptions.length) { setPortionFoodId(''); return; }
        if (!portionFoodId || !foodOptions.some((item) => item.id === String(portionFoodId))) {
            setPortionFoodId(foodOptions[0].id);
        }
    }, [foodOptions, portionFoodId, portionScope]);

    const portionSimulation = useMemo(() => {
        if (!meals.length) return null;
        if (portionScaleFactor === '' || !Number.isFinite(Number(portionScaleFactor)) || Number(portionScaleFactor) < 0.3 || Number(portionScaleFactor) > 3) return null;
        return simulateMealPlanPortionAdjustment(meals, Number(portionScaleFactor), {
            scope: portionScope,
            mealId: portionMealId || null,
            foodId: portionFoodId || null
        });
    }, [meals, portionScaleFactor, portionScope, portionMealId, portionFoodId]);

    const handleApplyPortionAdjustment = () => {
        if (!portionSimulation?.meals?.length) return;
        shadowTouchedRef.current = true;
        setMeals(portionSimulation.meals);
        setPortionScaleFactor(1);
    };

    // Existing draft recovery banner — só aparece quando o usuário veio por "Novo Plano"
    // (draft.existingDraft detectado internamente). NÃO aparece quando veio por "Retomar" (pendingDraft prop).
    const showDraftBanner = !isEditing && draftToRecover && !draft.draftId;

    // Show loading state while resuming
    if (isResuming) {
        return (
            <div className="space-y-4">
                <div className="mb-4 text-muted-foreground font-medium text-center">
                    Restaurando rascunho...
                </div>
                <FormSkeleton />
            </div>
        );
    }

    return (
        <>
            <MealPlanEditorHeader busy={loading} patientId={patientId} patientSlugOrId={patientSlugOrId} patientName={patientName} plan={initialData || pendingDraft} status={session?.status || shadow.status} onRetry={session?.flush || shadow.flush} onRecovery={onRecovery} onBack={handleCancel} />
            <form onSubmit={handleApplyPlan} className="mt-5 space-y-5">
                {/* Draft Recovery Banner */}
                {/* Recovery Banner */}
                {showDraftBanner && (
                    <Alert className="mb-6 bg-amber-50 border-amber-200">
                        <FolderOpen className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="flex items-center justify-between w-full gap-4">
                            <span className="text-sm text-amber-800">
                                Identificamos um rascunho inacabado para este paciente. Deseja retomá-lo?
                            </span>
                            <div className="flex gap-2 flex-shrink-0">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
                                    onClick={handleResumeDraft}
                                >
                                    Retomar Rascunho
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-amber-700 hover:bg-amber-100 hover:text-amber-900 border border-transparent hover:border-amber-200"
                                    onClick={() => setShowDiscardConfirm(true)}
                                >
                                    Descartar
                                </Button>
                            </div>
                        </AlertDescription>
                    </Alert>
                )}

                {/* Draft Initialization Loading — só mostra durante inicialização real do hook */}
                {/* NÃO mostra quando pendingDraft está sendo retomado (auto-resume via prop) */}
                {!isEditing && !draft.draftId && !draft.existingDraft && !pendingDraft && !isResuming && draft.isInitializing && (
                    <div className="mb-6 p-4 border border-dashed rounded-lg bg-muted/30 flex items-center justify-center gap-3 text-muted-foreground motion-safe:animate-pulse">
                        <RefreshCw className="h-4 w-4 motion-safe:animate-spin text-primary" />
                        <span className="text-sm">Preparando salvamento automático…</span>
                    </div>
                )}

                {/* Informações Básicas */}
                {!restoredSession && <ShadowRecovery recovery={shadow.recovery} onRestore={restoreShadow} onDiscard={() => { void shadow.discardRecovery(); }} />}
                {referenceError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">Não foi possível carregar as metas de macronutrientes. <Button type="button" variant="outline" size="sm" onClick={loadReferenceValues}>Tentar novamente</Button></div>}
                <PlanConfiguration formData={formData} errors={errors} initiallyOpen={!isEditing}>
                        {/* Nome */}
                        <div className="space-y-2">
                            <Label htmlFor="name">
                                Nome do Plano <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="name"
                                name="name"
                                placeholder="Ex: Dieta Hipertrofia"
                                value={formData.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                className={errors.name ? 'border-destructive' : ''}
                                disabled={loading}
                            />
                            {errors.name && (
                                <p className="text-xs text-destructive">{errors.name}</p>
                            )}
                        </div>


                        {/* Descrição */}
                        <div className="space-y-2">
                            <Label htmlFor="description">Descrição (opcional)</Label>
                            <Textarea
                                id="description"
                                name="description"
                                rows={3}
                                placeholder="Descreva os objetivos e características do plano alimentar..."
                                value={formData.description}
                                onChange={(e) => handleChange('description', e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="plan_mode">ESTRATÉGIA DO PLANO</Label>
                            <Select value={formData.plan_mode} onValueChange={(value) => handleChange('plan_mode', value)} disabled={loading}>
                                <SelectTrigger id="plan_mode"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="quantitative">QUANTITATIVO — PORÇÕES E METAS DEFINIDAS</SelectItem>
                                    <SelectItem value="qualitative">QUALITATIVO — ORIENTAÇÕES E ESCOLHAS</SelectItem>
                                    <SelectItem value="hybrid">HÍBRIDO — PORÇÕES COM FLEXIBILIDADE</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">O modo organiza a apresentação; a decisão e a validação clínica permanecem com o nutricionista.</p>
                        </div>

                        {/* Datas */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="start_date">
                                    Data de Início <span className="text-destructive">*</span>
                                </Label>
                                <DateInputWithCalendar
                                    id="start_date"
                                    name="start_date"
                                    value={formData.start_date}
                                    onChange={(value) => handleChange('start_date', value)}
                                    className={errors.start_date ? 'border-destructive' : ''}
                                    disabled={loading}
                                />
                                {errors.start_date && (
                                    <p className="text-xs text-destructive">{errors.start_date}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="end_date">Data de Término (opcional)</Label>
                                <DateInputWithCalendar
                                    id="end_date"
                                    name="end_date"
                                    value={formData.end_date}
                                    onChange={(value) => handleChange('end_date', value)}
                                    className={errors.end_date ? 'border-destructive' : ''}
                                    disabled={loading}
                                />
                                {errors.end_date && (
                                    <p className="text-xs text-destructive">{errors.end_date}</p>
                                )}
                            </div>
                        </div>

                        {/* Dias da Semana */}
                        <div className="space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <Label>
                                    Dias Ativos <span className="text-destructive">*</span>
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={handleSelectWeekdays} className="flex-1 sm:flex-none text-xs sm:text-sm">
                                        Dias úteis
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={handleSelectWeekends} className="flex-1 sm:flex-none text-xs sm:text-sm">
                                        Fins de semana
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={handleSelectAllDays} className="flex-1 sm:flex-none text-xs sm:text-sm">
                                        {formData.active_days.length === 7 ? 'Limpar' : 'Todos'}
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                                {daysOfWeek.map((day) => (
                                    <label
                                        key={day.value}
                                        className={`
                                            flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 px-1 sm:px-3 py-2 border rounded-lg cursor-pointer transition-colors text-xs sm:text-sm
                                            ${formData.active_days.includes(day.value)
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'hover:bg-muted'
                                            }
                                        `}
                                    >
                                        <Checkbox
                                            checked={formData.active_days.includes(day.value)}
                                            onCheckedChange={() => handleDayToggle(day.value)}
                                            disabled={loading}
                                            className="h-3 w-3 sm:h-4 sm:w-4"
                                        />
                                        <span className="text-xs sm:text-sm leading-tight text-center">{day.label.slice(0,3)}</span>
                                    </label>
                                ))}
                            </div>
                            {errors.active_days && <p className="text-xs text-destructive">{errors.active_days}</p>}
                        </div>

                </PlanConfiguration>
                <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,2.2fr)_minmax(300px,1fr)]">
                    <MealEditorList meals={meals} total={dailyTotals.daily_calories} disabled={loading || showDraftBanner} draggingIndex={draggingMealIndex}
                        onAdd={() => { setEditingMeal(null); setMealFoodTarget(null); setMealEditorState(null); setShowMealForm(true); }} onImport={() => setShowImportMealDialog(true)}
                        onEdit={handleEditMeal} onCopy={copyMeal} onMove={moveMeal} onDelete={handleDeleteMeal} onInclude={toggleMealTotals} onRemoveFood={handleRemoveFood}
                        onDragStart={beginMealDrag} onDragEnd={finishMealDrag} onDragCancel={() => { draggedMealRef.current = null; setDraggingMealIndex(null); }}>
                        {meals.length > 0 && <QuickPortionAdjustment factor={portionScaleFactor} onFactor={setPortionScaleFactor} scope={portionScope} onScope={setPortionScope} mealId={portionMealId} onMeal={setPortionMealId} foodId={portionFoodId} onFood={setPortionFoodId} mealOptions={mealOptions} foodOptions={foodOptions} simulation={portionSimulation} onApply={handleApplyPortionAdjustment} disabled={loading} />}
                    </MealEditorList>
                    <EditorNutritionPanel totals={previewTotals} meals={previewMeals} name={formData.name} patientId={patientId} patientSlugOrId={patientSlugOrId} planId={initialData?.id || draft.draftId} referenceValues={referenceValues} onReferenceUpdate={loadReferenceValues} energyCalculation={energyCalculation} energyLoading={energyLoading} energyError={energyError} onRetry={onRetryContext} onRecovery={onRecovery} preview={showMealForm && Boolean(mealEditorState)} />
                </div>
                <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-blue-200 sm:flex-row sm:items-center bg-blue-50 p-3 text-xs leading-relaxed text-blue-900"><p className="min-w-0 sm:flex-1">O salvamento automático preserva a sessão. Salvar rascunho não altera o plano aplicado ao paciente.</p><Button type="button" variant="ghost" size="sm" className="gap-2 text-blue-800" disabled={loading} onClick={onRecovery}><History className="h-4 w-4" />Ver histórico de recuperação</Button></div>
                {/* Botões de ação — 3 opções */}
                {Object.keys(errors).length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"><p className="font-semibold">Confira antes de salvar</p><p className="mt-1">{Object.values(errors).join(' · ')}</p><p className="mt-1 text-xs">Datas e dias da semana ficam em Configurações do plano.</p></div>}
                <MealPlanEditorFooter loading={loading} savingAction={savingAction} editing={isEditing && !initialData?.is_draft} onCancel={handleCancel} onSaveDraft={handleSaveAsInactivePlan} />
            </form>

            {/* Dialog de Refeição */}
            <MealPlanMealForm
                foodTarget={mealFoodTarget}
                isOpen={showMealForm}
                ownerId={nutritionistId}
                shadowKey={nestedRecovery ? nestedRecovery.draft_key.split(':food:')[0] : patientId ? `meal-plan-meal:${patientId}:${initialData?.id || 'new'}:${editingMeal?.dbId || editingMeal?.id || editingMeal?.tempId || 'new'}` : null}
                recoveryDraft={nestedRecovery}
                resumeState={restoredSession?.editor?.open ? restoredSession.editor.state : null}
                session={session}
                onWorkingState={receiveMealEditor}
                draftContext={{ planId: initialData?.id || draft.draftId || null, mealId: editingMeal?.dbId || editingMeal?.id || null }}
                onClose={() => { setMealEditorState(null); setShowMealForm(false); setEditingMeal(null); setMealFoodTarget(null); setNestedRecovery(null); }}
                onSave={editingMeal ? handleUpdateMeal : handleAddMeal}
                initialData={editingMeal}
            />

            {/* Dialog: Importar refeições de um protocolo */}
            <ImportMealFromProtocolDialog
                open={showImportMealDialog}
                onOpenChange={setShowImportMealDialog}
                nutritionistId={nutritionistId}
                onImport={async (templateMeals, templateId) => {
                    shadowTouchedRef.current = true;
                    let importedIds = [];
                    if (!isEditing) {
                        const existingDraftId = draft.draftId;
                        const activeDraftId = existingDraftId || await draft.startNewDraft();
                        if (!activeDraftId) throw new Error('Não foi possível iniciar o rascunho.');
                        try {
                            importedIds = await importDietTemplateMealsToPlan(templateId, activeDraftId, templateMeals.map(meal => meal.id));
                            if (!Array.isArray(importedIds) || importedIds.length !== templateMeals.length) {
                                throw new Error('A importação não confirmou todas as refeições.');
                            }
                        } catch (error) {
                            if (!existingDraftId) await draft.discardDraft();
                            throw error;
                        }
                    }
                    setMeals(prev => [...prev, ...templateMeals.map((meal, index) => ({
                            name: meal.name,
                            meal_type: 'other',
                            meal_time: meal.meal_time,
                            notes: meal.notes,
                            order_index: prev.length + index,
                            foods: ensureMealFoodIds(meal.foods),
                            calories: meal.calories,
                            protein: meal.protein,
                            carbs: meal.carbs,
                            fat: meal.fat,
                            tempId: `import-${meal.id}-${index}-${Date.now()}`,
                            dbId: importedIds[index] ?? null
                        }))]);
                    setShowImportMealDialog(false);
                    return true;
                }}
            />

            {/* Confirmação de Descarte de Rascunho */}
            <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Descartar rascunho?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Isso apagará permanentemente todos os dados do rascunho pendente. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={async () => {
                                await draft.discardExistingAndStartNew();
                                setShowDiscardConfirm(false);
                            }}
                        >
                            Confirmar Descarte
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
};

export default MealPlanForm;
