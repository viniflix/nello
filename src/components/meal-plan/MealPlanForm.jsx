import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
    Save, X, Plus, Trash2, Edit, Calendar, CloudOff, Cloud, 
    Loader2, AlertTriangle, CheckCircle2, History, FolderOpen, RefreshCw 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInputWithCalendar } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import MacrosChart from './MacrosChart';
import { getReferenceValues, simulateMealPlanPortionAdjustment, getMealPlanById } from '@/lib/supabase/meal-plan-queries';
import { useMealPlanDraft } from '@/hooks/useMealPlanDraft';

const SaveStatusIndicator = ({ status }) => {
    if (status === 'saving') return (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground animate-pulse">
            <Loader2 className="h-3 w-3 animate-spin" />
            Salvando rascunho...
        </span>
    );
    if (status === 'saved') return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Cloud className="h-3 w-3" />
            Rascunho salvo
        </span>
    );
    if (status === 'error') return (
        <span className="flex items-center gap-1.5 text-xs text-destructive">
            <CloudOff className="h-3 w-3" />
            Erro ao salvar
        </span>
    );
    return null;
};

const MealPlanForm = ({
    patientId,
    patientSlugOrId,
    nutritionistId,
    initialData = null,
    pendingDraft = null,   // rascunho completo já carregado pela página mãe
    onSubmit,
    onSaveDraft,
    onCancel,
    onDraftDiscarded,       // callback após descartar rascunho interno
    loading = false
}) => {
    const isEditing = Boolean(initialData?.id);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    });

    const [meals, setMeals] = useState([]);
    const [showMealForm, setShowMealForm] = useState(false);
    const [editingMeal, setEditingMeal] = useState(null);
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
    const [errors, setErrors] = useState({});
    const [referenceValues, setReferenceValues] = useState(null);
    const [portionScaleFactor, setPortionScaleFactor] = useState(1);
    const [portionScope, setPortionScope] = useState('all');
    const [portionMealId, setPortionMealId] = useState('');
    const [portionFoodId, setPortionFoodId] = useState('');
    const [isResuming, setIsResuming] = useState(false);

    // Draft auto-save — only active when creating a new plan (not editing)
    // enabled=false quando já temos um pendingDraft vindo da página mãe (evita double query)
    const draft = useMealPlanDraft({
        patientId,
        nutritionistId,
        enabled: !isEditing && !pendingDraft
    });

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
        if (initialData?.id) {
            const { data } = await getReferenceValues(initialData.id);
            setReferenceValues(data);
        }
    }, [initialData?.id]);

    // Populate form when editing existing plan
    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                description: initialData.description || '',
                start_date: initialData.start_date || new Date().toISOString().split('T')[0],
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
            loadReferenceValues();
        }
    }, [initialData, loadReferenceValues]);

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
                draft.setActiveDraftId(pendingDraft.id);
            } else {
                fullPlan = await draft.resumeExistingDraft();
            }

            if (fullPlan) {
                setFormData({
                    name: fullPlan.name || '',
                    description: fullPlan.description || '',
                    start_date: fullPlan.start_date || new Date().toISOString().split('T')[0],
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
            console.error('[MealPlanForm] Error resuming draft:', error);
        } finally {
            setIsResuming(false);
        }
    };

    const handleDiscardDraftAndStartFresh = async () => {
        if (pendingDraft) {
            await import('@/lib/supabase/meal-plan-queries').then(m => m.deleteDraftMealPlan(pendingDraft.id));
            onDraftDiscarded?.();
        } else if (draft.existingDraft) {
            // Deleta o rascunho antigo sem criar um novo (criação é lazy)
            await import('@/lib/supabase/meal-plan-queries').then(m => m.deleteDraftMealPlan(draft.existingDraft.id));
            draft.clearExistingDraft(); // sinaliza ao hook que não há mais draft pendente
        } else if (draft.draftId) {
            await draft.discardDraft(); // deleta o draft atual (novo, mas vazio)
        }
        setFormData({
            name: '',
            description: '',
            start_date: new Date().toISOString().split('T')[0],
            end_date: '',
            active_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
        });
        setMeals([]);
    };

    const handleChange = (field, value) => {
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
        let activeDraftId = draft.draftId;

        // Criação LAZY: se ainda não tem draft, cria agora (na 1ª refeição)
        // Isso evita drafts vazios que reaparecem após descartar
        if (!isEditing && !activeDraftId) {
            activeDraftId = await draft.startNewDraft();
            if (!activeDraftId) {
                console.error('[MealPlanForm] Não foi possível criar rascunho. Refeição não adicionada.');
                return;
            }
        }

        const newMealData = { ...mealData, tempId: Date.now(), order_index: meals.length };

        if (!isEditing && activeDraftId) {
            // Persiste refeição + alimentos no rascunho imediatamente
            const dbMealId = await draft.saveMeal({ ...mealData, order_index: meals.length });
            newMealData.dbId = dbMealId;
        }

        setMeals(prev => [...prev, newMealData]);
    };

    const handleEditMeal = (meal) => {
        setEditingMeal(meal);
        setShowMealForm(true);
    };

    const handleUpdateMeal = async (updatedMeal) => {
        const mealIndex = meals.findIndex(m => m.tempId === editingMeal.tempId);
        let newDbId = editingMeal.dbId;

        // Persist to DB when building a draft (not editing an existing saved plan)
        if (!isEditing && draft.draftId && draft.updateMeal) {
            newDbId = await draft.updateMeal(editingMeal.dbId, updatedMeal, mealIndex >= 0 ? mealIndex : 0);
        }

        setMeals(prev => prev.map(m =>
            m.tempId === editingMeal.tempId
                ? { ...updatedMeal, tempId: m.tempId, dbId: newDbId ?? m.dbId }
                : m
        ));
        setEditingMeal(null);
    };

    const handleDeleteMeal = async (meal) => {
        if (!isEditing && draft.draftId && meal.dbId) {
            await draft.removeMeal(meal.dbId);
        }
        setMeals(prev => prev.filter(m => m.tempId !== meal.tempId));
    };

    const calculateDailyTotals = () => meals.reduce(
        (acc, meal) => ({
            daily_calories: acc.daily_calories + (meal.calories || 0),
            daily_protein: acc.daily_protein + (meal.protein || 0),
            daily_carbs: acc.daily_carbs + (meal.carbs || 0),
            daily_fat: acc.daily_fat + (meal.fat || 0)
        }),
        { daily_calories: 0, daily_protein: 0, daily_carbs: 0, daily_fat: 0 }
    );

    const validate = () => {
        const newErrors = {};
        if (formData.active_days.length === 0) newErrors.active_days = 'Selecione pelo menos um dia da semana';
        if (!formData.start_date) newErrors.start_date = 'Data de início é obrigatória';
        if (formData.end_date && formData.end_date < formData.start_date) newErrors.end_date = 'Data final deve ser posterior à data inicial';
        if (meals.length === 0) newErrors.meals = 'Adicione pelo menos uma refeição';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Button: "Aplicar Plano Alimentar" — promotes draft to active, or updates existing
    const handleApplyPlan = (e) => {
        e.preventDefault();
        if (!validate()) return;

        const totals = calculateDailyTotals();
        const planData = {
            patient_id: patientId,
            nutritionist_id: nutritionistId,
            ...formData,
            ...totals,
            meals,
            draftId: draft.draftId || null
        };

        onSubmit(planData, initialData?.id);
    };

    // Button: "Salvar como Rascunho" — saves plan without activating
    const handleSaveAsInactivePlan = (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            setErrors({ name: 'Dê um nome ao plano antes de salvar' });
            return;
        }

        const totals = calculateDailyTotals();
        const planData = {
            patient_id: patientId,
            nutritionist_id: nutritionistId,
            ...formData,
            ...totals,
            meals,
            draftId: draft.draftId || null,
            saveAsInactive: true
        };

        onSaveDraft?.(planData);
    };

    // Button: "Cancelar" — discards draft and closes form
    const handleCancel = async () => {
        if (!isEditing && draft.draftId) {
            await draft.discardDraft();
        }
        onCancel();
    };

    const dailyTotals = calculateDailyTotals();
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
        return simulateMealPlanPortionAdjustment(meals, portionScaleFactor, {
            scope: portionScope,
            mealId: portionMealId || null,
            foodId: portionFoodId || null
        });
    }, [meals, portionScaleFactor, portionScope, portionMealId, portionFoodId]);

    const parseScaleInput = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return 1;
        return Math.min(3, Math.max(0.3, parsed));
    };

    const handleApplyPortionAdjustment = () => {
        if (!portionSimulation?.meals?.length) return;
        setMeals(portionSimulation.meals);
        setPortionScaleFactor(1);
    };

    const formatDelta = (value, unit = '') => {
        const numeric = Number(value || 0);
        const signal = numeric > 0 ? '+' : '';
        return `${signal}${numeric.toFixed(unit === 'kcal' ? 0 : 1)}${unit ? ` ${unit}` : ''}`;
    };

    // Existing draft recovery banner — só aparece quando o usuário veio por "Novo Plano"
    // (draft.existingDraft detectado internamente). NÃO aparece quando veio por "Retomar" (pendingDraft prop).
    const showDraftBanner = !isEditing && draftToRecover && !draft.draftId;

    // Show loading state while resuming
    if (isResuming) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4">
                <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                <p className="text-muted-foreground">Restaurando rascunho...</p>
            </div>
        );
    }

    return (
        <>
            <form onSubmit={handleApplyPlan} className="space-y-6">

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
                                    variant="outline"
                                    size="sm"
                                    className="bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
                                    onClick={handleResumeDraft}
                                >
                                    Retomar Rascunho
                                </Button>
                                <Button
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
                    <div className="mb-6 p-4 border border-dashed rounded-lg bg-muted/30 flex items-center justify-center gap-3 text-muted-foreground animate-pulse">
                        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm">Iniciando rascunho de segurança...</span>
                    </div>
                )}

                {/* Informações Básicas */}
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-lg">Informações do Plano</CardTitle>
                            {!isEditing && <SaveStatusIndicator status={draft.saveStatus} />}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                                <div className="flex gap-2 flex-shrink-0">
                                    <Button type="button" variant="outline" size="sm" onClick={handleSelectWeekdays} className="flex-1 sm:flex-none text-xs sm:text-sm">
                                        Dias úteis
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={handleSelectWeekends} className="flex-1 sm:flex-none text-xs sm:text-sm">
                                        Fins de semana
                                    </Button>
                                    <Button type="button" variant="outline" size="sm" onClick={handleSelectAllDays} className="flex-1 sm:flex-none text-xs sm:text-sm">
                                        {formData.active_days.length === 7 ? 'Limpar' : 'Todos'}
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 gap-1 sm:gap-2">
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
                                        <span className="text-[10px] sm:text-sm leading-tight text-center">{day.label}</span>
                                    </label>
                                ))}
                            </div>
                            {errors.active_days && <p className="text-xs text-destructive">{errors.active_days}</p>}
                        </div>
                    </CardContent>
                </Card>

                {/* Simulador de Ajuste de Porções */}
                {meals.length > 0 && portionSimulation ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Simulador de Ajuste de Porções</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="space-y-2">
                                    <Label htmlFor="portion-factor">Fator de ajuste</Label>
                                    <Input
                                        id="portion-factor"
                                        name="portion-factor"
                                        type="number"
                                        min={0.3}
                                        max={3}
                                        step={0.05}
                                        value={portionScaleFactor}
                                        onChange={(e) => setPortionScaleFactor(parseScaleInput(e.target.value))}
                                        disabled={loading}
                                    />
                                    <p className="text-xs text-muted-foreground">Ex.: 1.10 aumenta 10%, 0.90 reduz 10%</p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="portion-scope">Aplicar em</Label>
                                    <select
                                        id="portion-scope"
                                        name="portion-scope"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={portionScope}
                                        onChange={(e) => setPortionScope(e.target.value)}
                                        disabled={loading}
                                    >
                                        <option value="all">Plano completo</option>
                                        <option value="meal">Refeição específica</option>
                                        <option value="food">Alimento específico</option>
                                    </select>
                                </div>
                                {portionScope === 'meal' || portionScope === 'food' ? (
                                    <div className="space-y-2">
                                        <Label htmlFor="portion-meal">Refeição alvo</Label>
                                        <select
                                            id="portion-meal"
                                            name="portion-meal"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={portionMealId}
                                            onChange={(e) => setPortionMealId(e.target.value)}
                                            disabled={loading || mealOptions.length === 0}
                                        >
                                            {mealOptions.map((meal) => (
                                                <option key={meal.id} value={meal.id}>{meal.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : null}
                                {portionScope === 'food' ? (
                                    <div className="space-y-2 md:col-span-3">
                                        <Label htmlFor="portion-food">Alimento alvo</Label>
                                        <select
                                            id="portion-food"
                                            name="portion-food"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                            value={portionFoodId}
                                            onChange={(e) => setPortionFoodId(e.target.value)}
                                            disabled={loading || foodOptions.length === 0}
                                        >
                                            {foodOptions.length ? (
                                                foodOptions.map((food) => (
                                                    <option key={food.id} value={food.id}>{food.name}</option>
                                                ))
                                            ) : (
                                                <option value="">Sem alimentos nesta refeição</option>
                                            )}
                                        </select>
                                    </div>
                                ) : null}
                                <div className="rounded-lg border p-3">
                                    <p className="text-xs text-muted-foreground">Antes</p>
                                    <p className="text-sm font-medium">{portionSimulation.totalsBefore.calories.toFixed(0)} kcal</p>
                                    <p className="text-xs text-muted-foreground">
                                        P {portionSimulation.totalsBefore.protein.toFixed(1)}g · C {portionSimulation.totalsBefore.carbs.toFixed(1)}g · G {portionSimulation.totalsBefore.fat.toFixed(1)}g
                                    </p>
                                </div>
                                <div className="rounded-lg border p-3 bg-muted/20">
                                    <p className="text-xs text-muted-foreground">Depois (preview)</p>
                                    <p className="text-sm font-medium">{portionSimulation.totalsAfter.calories.toFixed(0)} kcal</p>
                                    <p className="text-xs text-muted-foreground">
                                        P {portionSimulation.totalsAfter.protein.toFixed(1)}g · C {portionSimulation.totalsAfter.carbs.toFixed(1)}g · G {portionSimulation.totalsAfter.fat.toFixed(1)}g
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 bg-muted/10">
                                <p className="text-xs text-muted-foreground">
                                    Delta: {formatDelta(portionSimulation.delta.calories, 'kcal')} · {formatDelta(portionSimulation.delta.protein, 'g')} proteína · {formatDelta(portionSimulation.delta.carbs, 'g')} carboidrato · {formatDelta(portionSimulation.delta.fat, 'g')} gordura
                                </p>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleApplyPortionAdjustment}
                                    disabled={loading || Math.abs(Number(portionScaleFactor || 1) - 1) < 0.001}
                                >
                                    Aplicar ajuste ao plano
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}

                {/* Refeições + Gráfico */}
                {meals.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                        <div className="lg:col-span-6">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-lg">Refeições</CardTitle>
                                        <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => setShowMealForm(true)}
                                        disabled={!isEditing && !draft.draftId}
                                        title={(!isEditing && !draft.draftId) ? "Aguarde a inicialização do rascunho" : ""}
                                    >
                                        <Plus className="h-4 w-4 mr-2" />
                                        Nova Refeição
                                    </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        {meals.map((meal, index) => (
                                            <div key={meal.tempId} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-muted-foreground">#{index + 1}</span>
                                                            <h4 className="font-semibold">{meal.name}</h4>
                                                            {meal.meal_time && (
                                                                <Badge variant="outline">
                                                                    <Calendar className="h-3 w-3 mr-1" />
                                                                    {meal.meal_time}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground mt-1">
                                                            {meal.foods?.length || 0} alimento(s) •{' '}
                                                            {meal.calories?.toFixed(0) || 0} kcal •
                                                            P: {meal.protein?.toFixed(1) || 0}g •
                                                            C: {meal.carbs?.toFixed(1) || 0}g •
                                                            G: {meal.fat?.toFixed(1) || 0}g
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button type="button" variant="ghost" size="sm" onClick={() => handleEditMeal(meal)}>
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button type="button" variant="ghost" size="sm" onClick={() => handleDeleteMeal(meal)}>
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <div className="lg:col-span-4">
                            <MacrosChart
                                protein={dailyTotals.daily_protein}
                                carbs={dailyTotals.daily_carbs}
                                fat={dailyTotals.daily_fat}
                                calories={dailyTotals.daily_calories}
                                patientId={patientId}
                                patientSlugOrId={patientSlugOrId}
                                planId={initialData?.id}
                                referenceValues={referenceValues}
                                onReferenceUpdate={loadReferenceValues}
                            />
                        </div>
                    </div>
                )}

                {/* Refeições — Estado vazio */}
                {meals.length === 0 && (
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">Refeições</CardTitle>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => { setEditingMeal(null); setShowMealForm(true); }}
                                    disabled={loading || showDraftBanner}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Adicionar Refeição
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-center py-8 text-muted-foreground">
                                Nenhuma refeição adicionada ainda
                                {errors.meals && <p className="text-destructive mt-2">{errors.meals}</p>}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Botões de ação — 3 opções */}
                <div className="flex flex-col sm:flex-row gap-3 justify-end pt-2">
                    {/* Cancelar */}
                    <Button
                        type="button"
                        variant="outline"
                        onClick={handleCancel}
                        disabled={loading}
                        className="sm:order-1"
                    >
                        <X className="w-4 h-4 mr-2" />
                        Cancelar
                    </Button>

                    {/* Salvar como Rascunho — only for new plans, or show "Salvar sem Ativar" for editing */}
                    {!isEditing && (
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleSaveAsInactivePlan}
                            disabled={loading}
                            className="sm:order-2"
                        >
                            <Save className="w-4 h-4 mr-2" />
                            {loading ? 'Salvando...' : 'Salvar sem ativar'}
                        </Button>
                    )}

                    {/* Aplicar Plano Alimentar — primary action */}
                    <Button
                        type="submit"
                        disabled={loading}
                        className="sm:order-3 font-semibold"
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {loading
                            ? 'Salvando...'
                            : isEditing
                                ? 'Salvar alterações'
                                : 'Aplicar Plano Alimentar'
                        }
                    </Button>
                </div>
            </form>

            {/* Dialog de Refeição */}
            <MealPlanMealForm
                isOpen={showMealForm}
                onClose={() => { setShowMealForm(false); setEditingMeal(null); }}
                onSave={editingMeal ? handleUpdateMeal : handleAddMeal}
                initialData={editingMeal}
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
