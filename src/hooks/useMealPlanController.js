import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/customSupabaseClient';
import {
    getMealPlanVersions,
    deleteDraftMealPlan,
    deleteAllDraftMealPlans,
    getMealPlanById,
    updateFullMealPlan,
    promoteDraftToActive,
    createMealPlan,
    saveDraftAsPlan,
    archiveMealPlan,
    setActiveMealPlan,
    copyMealPlanToPatient,
    deleteMealPlan,
    savePlanAsTemplate,
    restoreMealPlanVersion,
    getReferenceValues
} from '@/lib/supabase/meal-plan-queries';
import { getLatestEnergyCalculation } from '@/lib/supabase/energy-queries';
import { getPatientModuleSyncFlags, clearPatientModuleSyncFlags } from '@/lib/supabase/anthropometry-queries';
import { generateShoppingList } from '@/lib/pdf/shoppingListGenerator';
import { exportMealPlanToPdf } from '@/lib/pdfUtils';
import { translateMealType } from '@/utils/mealTranslations';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';

export function useMealPlanController({
    patientId,
    nutritionistId,
    paramValue,
    plans,
    activePlan,
    pendingDrafts,
    loadPlans,
    invalidatePlans,
    user
}) {
    const { toast } = useToast();
    const navigate = useNavigate();

    // =============== UI States ===============
    const [submitting, setSubmitting] = useState(false);
    const [patientName, setPatientName] = useState('');
    const [referenceValues, setReferenceValues] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingPlan, setEditingPlan] = useState(null);
    
    // Dialog states
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [planToDelete, setPlanToDelete] = useState(null);
    const [copyModelDialogOpen, setCopyModelDialogOpen] = useState(false);
    const [planToCopy, setPlanToCopy] = useState(null);
    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
    const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [templateTags, setTemplateTags] = useState('');
    const [discardAllDraftsDialogOpen, setDiscardAllDraftsDialogOpen] = useState(false);
    const [newPlanChoiceOpen, setNewPlanChoiceOpen] = useState(false);
    const [plansModalOpen, setPlansModalOpen] = useState(false);
    const [plansSearchTerm, setPlansSearchTerm] = useState('');

    // Draft states
    const [pendingDraft, setPendingDraft] = useState(null);
    const [discardingDraft, setDiscardingDraft] = useState(false);
    const [draftToDelete, setDraftToDelete] = useState(null);

    // Versions states
    const [mealPlanVersions, setMealPlanVersions] = useState([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [selectedVersionId, setSelectedVersionId] = useState('');
    const [restoringVersion, setRestoringVersion] = useState(false);
    const [versionsExpanded, setVersionsExpanded] = useState(false);

    // Context states
    const [energyCalculation, setEnergyCalculation] = useState(null);
    const [syncFlags, setSyncFlags] = useState(null);

    // =============== Effects ===============

    useEffect(() => {
        const loadPatientName = async () => {
            if (!patientId) return;
            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('name')
                    .eq('id', patientId)
                    .single();
                if (!error && data) setPatientName(data.name);
            } catch (error) {
                console.error('Erro ao carregar nome do paciente:', error);
            }
        };
        loadPatientName();
    }, [patientId]);

    useEffect(() => {
        const loadReferenceValues = async () => {
            if (activePlan?.id) {
                const { data } = await getReferenceValues(activePlan.id);
                setReferenceValues(data);
            } else {
                setReferenceValues(null);
            }
        };
        loadReferenceValues();
    }, [activePlan?.id]);

    useEffect(() => {
        const loadVersions = async () => {
            if (!activePlan?.id) {
                setMealPlanVersions([]);
                setSelectedVersionId('');
                return;
            }
            setVersionsLoading(true);
            try {
                const { data, error } = await getMealPlanVersions(activePlan.id, 20);
                if (error) throw error;
                const versions = data || [];
                setMealPlanVersions(versions);
                const preferred = versions.length > 1 ? versions[1] : versions[0];
                setSelectedVersionId(preferred ? String(preferred.id) : '');
            } catch (error) {
                console.error('Erro ao carregar versões do plano:', error);
                setMealPlanVersions([]);
                setSelectedVersionId('');
            } finally {
                setVersionsLoading(false);
            }
        };
        loadVersions();
    }, [activePlan?.id]);

    useEffect(() => {
        const loadEnergyCalculation = async () => {
            if (!patientId) return;
            try {
                const { data, error } = await getLatestEnergyCalculation(patientId);
                if (error) throw error;
                setEnergyCalculation(data);
            } catch (error) {
                console.error('Erro ao carregar cálculo de energia:', error);
            }
        };
        loadEnergyCalculation();
    }, [patientId]);

    useEffect(() => {
        const loadSyncFlags = async () => {
            if (!patientId) return;
            const { data } = await getPatientModuleSyncFlags(patientId);
            setSyncFlags(data || null);
        };
        loadSyncFlags();
    }, [patientId]);

    // =============== Handlers ===============

    const handleDiscardPendingDraft = async (targetDraftId = null) => {
        const idToDelete = targetDraftId || (pendingDrafts.length > 0 ? pendingDrafts[0].id : null);
        if (!idToDelete) return;

        setDiscardingDraft(true);
        const { error } = await deleteDraftMealPlan(idToDelete);
        setDiscardingDraft(false);

        if (error) {
            toast({
                title: 'Erro ao descartar rascunho',
                description: 'Não foi possível remover o rascunho. Tente novamente.',
                variant: 'destructive'
            });
            return;
        }

        invalidatePlans();

        if (pendingDraft && (pendingDraft.id === idToDelete || !targetDraftId)) {
            setPendingDraft(null);
        }
        toast({ title: 'Rascunho descartado com sucesso', variant: 'default' });
    };

    const handleDiscardAllDrafts = async () => {
        if (!patientId) return;
        setDiscardingDraft(true);
        const { error } = await deleteAllDraftMealPlans(patientId);
        setDiscardingDraft(false);

        if (error) {
            toast({
                title: 'Erro ao descartar rascunhos',
                description: 'Ocorreu um erro ao remover os rascunhos.',
                variant: 'destructive'
            });
        } else {
            invalidatePlans();
            setPendingDraft(null);
            setDiscardAllDraftsDialogOpen(false);
            toast({ title: 'Todos os rascunhos foram descartados', variant: 'default' });
        }
    };

    const handleResumePendingDraft = async (draft = null) => {
        const targetDraft = draft || (pendingDrafts.length > 0 ? pendingDrafts[0] : null);
        if (!targetDraft) return;

        const { data: fullDraft } = await getMealPlanById(targetDraft.id);

        setEditingPlan(null);
        setPendingDraft(fullDraft || targetDraft); 
        setShowForm(true);
    };

    const handleMarkMealPlanAsReviewed = async () => {
        const { error } = await clearPatientModuleSyncFlags(patientId, { mealPlan: true });
        if (error) {
            toast({
                title: 'Não foi possível marcar como revisado',
                description: 'Tente novamente em instantes.',
                variant: 'destructive'
            });
            return;
        }

        setSyncFlags((prev) => ({ ...(prev || {}), needs_meal_plan_review: false }));
        toast({
            title: 'Pendência removida',
            description: 'O módulo de plano alimentar foi marcado como revisado.',
            variant: 'success'
        });
    };

    const resolveUniquePlanName = (rawName, existingPlans, excludePlanId = null) => {
        const base = rawName?.trim() || 'Plano Alimentar sem Nome';
        const usedNames = (existingPlans || [])
            .filter(p => p.id !== excludePlanId)
            .map(p => (p.name || '').trim().toLowerCase());

        if (!usedNames.includes(base.toLowerCase())) return base;

        let counter = 1;
        while (usedNames.includes(`${base} (${counter})`.toLowerCase())) {
            counter++;
        }
        return `${base} (${counter})`;
    };

    const handleSubmit = async (planData, planId = null) => {
        setSubmitting(true);
        try {
            const resolvedName = resolveUniquePlanName(planData.name, plans, planId);
            const finalPlanData = { ...planData, name: resolvedName };

            if (planId) {
                const result = await updateFullMealPlan(planId, finalPlanData);
                if (result.error) throw result.error;
            } else if (finalPlanData.draftId) {
                const syncResult = await updateFullMealPlan(finalPlanData.draftId, finalPlanData);
                if (syncResult.error) throw syncResult.error;

                const result = await promoteDraftToActive(finalPlanData.draftId, patientId);
                if (result.error) throw result.error;
            } else {
                const result = await createMealPlan({
                    patient_id: finalPlanData.patient_id,
                    nutritionist_id: finalPlanData.nutritionist_id,
                    name: finalPlanData.name,
                    description: finalPlanData.description,
                    active_days: finalPlanData.active_days,
                    start_date: finalPlanData.start_date,
                    end_date: finalPlanData.end_date || null
                });
                if (result.error) throw result.error;

                const updateResult = await updateFullMealPlan(result.data.id, finalPlanData);
                if (updateResult.error) throw updateResult.error;
            }

            toast({
                title: 'Sucesso',
                description: planId ? 'Plano atualizado com sucesso' : 'Plano aplicado com sucesso',
                variant: 'success'
            });

            const { error: clearError } = await clearPatientModuleSyncFlags(patientId, { mealPlan: true });
            if (!clearError) {
                setSyncFlags((prev) => ({ ...(prev || {}), needs_meal_plan_review: false }));
            }

            setShowForm(false);
            setEditingPlan(null);
            setPendingDraft(null);
            await loadPlans();
        } catch (error) {
            console.error('Erro ao salvar plano:', error);
            toast({
                title: 'Erro ao salvar plano',
                description: error?.message || 'Não foi possível salvar o plano alimentar.',
                variant: 'destructive'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveDraft = async (planData) => {
        setSubmitting(true);
        try {
            const resolvedName = resolveUniquePlanName(planData.name, plans);
            const finalPlanData = { ...planData, name: resolvedName };

            if (finalPlanData.draftId) {
                const updateResult = await updateFullMealPlan(finalPlanData.draftId, { ...finalPlanData, is_active: false });
                if (updateResult.error) throw updateResult.error;

                const result = await saveDraftAsPlan(finalPlanData.draftId);
                if (result.error) throw result.error;
            } else {
                const result = await createMealPlan({
                    patient_id: patientId,
                    nutritionist_id: nutritionistId,
                    name: finalPlanData.name,
                    description: finalPlanData.description,
                    active_days: finalPlanData.active_days,
                    start_date: finalPlanData.start_date,
                    end_date: finalPlanData.end_date || null,
                    is_active: false,
                    is_draft: false
                });
                if (result.error) throw result.error;

                const updateResult = await updateFullMealPlan(result.data.id, { ...finalPlanData, is_active: false });
                if (updateResult.error) throw updateResult.error;
            }

            toast({
                title: 'Rascunho salvo',
                description: 'O rascunho foi salvo na lista de planos sem ser ativado.',
                variant: 'success'
            });

            setShowForm(false);
            setEditingPlan(null);
            setPendingDraft(null);
            await loadPlans();
        } catch (error) {
            console.error('Erro ao salvar rascunho:', error);
            toast({
                title: 'Erro ao salvar rascunho',
                description: error?.message || 'Não foi possível salvar o rascunho.',
                variant: 'destructive'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = async (planId) => {
        try {
            const result = await getMealPlanById(planId);
            if (result.error) throw result.error;
            setEditingPlan(result.data);
            setShowForm(true);
        } catch (error) {
            console.error('Erro ao carregar plano para edição:', error);
            toast({ title: 'Erro', description: 'Não foi possível carregar o plano para edição', variant: 'destructive' });
        }
    };

    const handleArchive = async (planId) => {
        try {
            const result = await archiveMealPlan(planId);
            if (result.error) throw result.error;
            toast({ title: 'Sucesso', description: 'Plano arquivado com sucesso', variant: 'success' });
            await loadPlans();
        } catch (error) {
            console.error('Erro ao arquivar plano:', error);
            toast({ title: 'Erro', description: 'Não foi possível arquivar o plano', variant: 'destructive' });
        }
    };

    const handleSetActive = async (planId) => {
        try {
            const result = await setActiveMealPlan(planId);
            if (result.error) throw result.error;
            toast({ title: 'Sucesso', description: 'Plano ativado com sucesso', variant: 'success' });
            await loadPlans();
        } catch (error) {
            console.error('Erro ao ativar plano:', error);
            toast({ title: 'Erro', description: 'Não foi possível ativar o plano', variant: 'destructive' });
        }
    };

    const handleCopy = (planId) => {
        const plan = plans.find(p => p.id === planId) || activePlan;
        if (plan) {
            setPlanToCopy(plan);
            setCopyModelDialogOpen(true);
        }
    };

    const handleCopyToPatient = async (targetPatientId) => {
        try {
            const result = await copyMealPlanToPatient(planToCopy.id, targetPatientId);
            if (result.error) throw result.error;
            toast({ title: 'Sucesso', description: `Plano copiado para o paciente com sucesso`, variant: 'success' });
            setCopyModelDialogOpen(false);
            setPlanToCopy(null);
        } catch (error) {
            console.error('Erro ao copiar modelo:', error);
            toast({ title: 'Erro', description: 'Não foi possível copiar o modelo para o paciente', variant: 'destructive' });
        }
    };

    const handleGenerateShoppingList = async () => {
        if (!activePlan) return;
        try {
            const result = await getMealPlanById(activePlan.id);
            if (result.error) throw result.error;
            await generateShoppingList(result.data, patientName);
            toast({ title: 'Lista de Compras gerada!', description: 'O PDF foi baixado com sucesso.' });
        } catch (error) {
            console.error('Erro ao gerar lista de compras:', error);
            toast({ title: 'Erro', description: 'Não foi possível gerar a lista de compras.', variant: 'destructive' });
        }
    };

    const handleExportPDF = async (includeNutrients) => {
        if (!activePlan) return;
        try {
            setExportDialogOpen(false);
            const result = await getMealPlanById(activePlan.id);
            if (result.error) throw result.error;
            await exportMealPlanToPdf(
                result.data,
                patientName,
                user?.profile?.name,
                includeNutrients,
                translateMealType,
                formatQuantityWithUnit
            );
            toast({ title: 'PDF gerado!', description: 'Plano alimentar exportado com sucesso.', variant: 'success' });
        } catch (error) {
            console.error('Erro ao exportar PDF:', error);
            toast({ title: 'Erro', description: 'Não foi possível exportar o plano alimentar', variant: 'destructive' });
        }
    };

    const handleDelete = async () => {
        if (!planToDelete) return;
        try {
            const result = await deleteMealPlan(planToDelete);
            if (result.error) throw result.error;
            toast({ title: 'Sucesso', description: 'Plano deletado com sucesso', variant: 'success' });
            setPlanToDelete(null);
            setDeleteDialogOpen(false);
            await loadPlans();
        } catch (error) {
            console.error('Erro ao deletar plano:', error);
            toast({ title: 'Erro', description: 'Não foi possível deletar o plano', variant: 'destructive' });
        }
    };

    const handleSaveAsTemplate = async () => {
        if (!activePlan || !templateName.trim()) return;
        setSubmitting(true);
        try {
            const tagsArray = templateTags ? templateTags.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];
            const { error } = await savePlanAsTemplate(activePlan.id, templateName.trim(), tagsArray);
            if (error) throw error;
            toast({ title: 'Template Salvo', description: `Plano salvo como template "${templateName}" com sucesso.`, variant: 'success' });
            setSaveTemplateDialogOpen(false);
            setTemplateName('');
            setTemplateTags('');
        } catch (error) {
            console.error('Erro ao salvar template:', error);
            toast({ title: 'Erro', description: 'Não foi possível salvar o template.', variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleRestoreVersion = async () => {
        const selectedVersion = mealPlanVersions.find((v) => String(v.id) === String(selectedVersionId)) || null;
        if (!selectedVersion) return;
        const confirmRestore = window.confirm(`Deseja restaurar a versão ${selectedVersion.version_number}? Isso criará uma nova versão de rollback.`);
        if (!confirmRestore) return;

        setRestoringVersion(true);
        try {
            const result = await restoreMealPlanVersion(selectedVersion.id);
            if (result.error) throw result.error;
            toast({ title: 'Versão Restaurada', description: `O plano foi restaurado para a versão ${selectedVersion.version_number}.`, variant: 'success' });
            await loadPlans();
            setVersionsExpanded(false);
        } catch (error) {
            console.error('Erro ao restaurar versão:', error);
            toast({ title: 'Erro', description: 'Não foi possível restaurar esta versão.', variant: 'destructive' });
        } finally {
            setRestoringVersion(false);
        }
    };

    // Formatter helpers
    const formatDate = (dateString) => dateString ? new Date(dateString).toLocaleDateString('pt-BR') : null;

    const getDaysLabel = (activeDays) => {
        if (!activeDays || activeDays.length === 0) return 'Nenhum dia';
        if (activeDays.length === 7) return 'Todos os dias';
        const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        const weekends = ['saturday', 'sunday'];
        const isWeekdays = weekdays.every(day => activeDays.includes(day)) && !weekends.some(day => activeDays.includes(day));
        const isWeekends = weekends.every(day => activeDays.includes(day)) && !weekdays.some(day => activeDays.includes(day));
        if (isWeekdays) return 'Dias úteis';
        if (isWeekends) return 'Fins de semana';
        return `${activeDays.length} dias`;
    };

    const formatRelativeTime = (isoDate) => {
        if (!isoDate) return '';
        const date = new Date(isoDate);
        if (Number.isNaN(date.getTime())) return '';
        const diffMs = Date.now() - date.getTime();
        const diffHours = diffMs / 3600000;
        if (diffHours < 24) {
            if (diffHours < 1) {
                const minutes = Math.floor(diffMs / 60000);
                return minutes < 1 ? 'agora mesmo' : `há ${minutes} min`;
            }
            return `há ${Math.floor(diffHours)} h`;
        }
        return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const getMetricsFromSnapshot = (snapshot) => {
        const plan = snapshot?.plan || {};
        const meals = Array.isArray(snapshot?.meals) ? snapshot.meals : [];
        return {
            calories: Number(plan.daily_calories || 0),
            protein: Number(plan.daily_protein || 0),
            carbs: Number(plan.daily_carbs || 0),
            fat: Number(plan.daily_fat || 0),
            mealsCount: meals.length
        };
    };

    const currentMetrics = activePlan ? {
        calories: Number(activePlan.daily_calories || 0),
        protein: Number(activePlan.daily_protein || 0),
        carbs: Number(activePlan.daily_carbs || 0),
        fat: Number(activePlan.daily_fat || 0),
        mealsCount: Number(activePlan.meals?.length || 0)
    } : null;

    const selectedVersion = mealPlanVersions.find((v) => String(v.id) === String(selectedVersionId)) || null;
    const baseMetrics = selectedVersion ? getMetricsFromSnapshot(selectedVersion.snapshot) : null;

    const buildDelta = (currentValue, baseValue) => {
        const delta = Number(currentValue || 0) - Number(baseValue || 0);
        return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
    };

    return {
        // States
        submitting, setSubmitting,
        patientName,
        referenceValues,
        showForm, setShowForm,
        editingPlan, setEditingPlan,
        deleteDialogOpen, setDeleteDialogOpen,
        planToDelete, setPlanToDelete,
        copyModelDialogOpen, setCopyModelDialogOpen,
        planToCopy, setPlanToCopy,
        exportDialogOpen, setExportDialogOpen,
        templateManagerOpen, setTemplateManagerOpen,
        saveTemplateDialogOpen, setSaveTemplateDialogOpen,
        templateName, setTemplateName,
        templateTags, setTemplateTags,
        discardAllDraftsDialogOpen, setDiscardAllDraftsDialogOpen,
        newPlanChoiceOpen, setNewPlanChoiceOpen,
        plansModalOpen, setPlansModalOpen,
        plansSearchTerm, setPlansSearchTerm,
        pendingDraft, setPendingDraft,
        discardingDraft,
        draftToDelete, setDraftToDelete,
        mealPlanVersions,
        selectedVersionId, setSelectedVersionId,
        restoringVersion,
        versionsExpanded, setVersionsExpanded,
        energyCalculation,
        syncFlags, setSyncFlags,
        
        // Handlers
        handleDiscardPendingDraft,
        handleDiscardAllDrafts,
        handleResumePendingDraft,
        handleMarkMealPlanAsReviewed,
        handleSubmit,
        handleSaveDraft,
        handleEdit,
        handleArchive,
        handleSetActive,
        handleCopy,
        handleCopyToPatient,
        handleGenerateShoppingList,
        handleExportPDF,
        handleDelete,
        handleSaveAsTemplate,
        handleRestoreVersion,
        
        // Helpers & Computed
        formatDate,
        getDaysLabel,
        formatRelativeTime,
        currentMetrics,
        baseMetrics,
        buildDelta
    };
}
