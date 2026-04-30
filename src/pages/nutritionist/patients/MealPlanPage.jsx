import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { ArrowLeft, Plus, Trash2, Copy, Archive, RefreshCw, Edit, BarChart3, Download, FileText, MoreVertical, Utensils, Save, FolderOpen, ShoppingCart, AlertCircle, Calendar, CalendarCheck, CalendarDays, UtensilsCrossed, Info, Send, ChevronDown, ChevronUp, Search, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog';
import MealPlanForm from '@/components/meal-plan/MealPlanForm';
import MacrosChart from '@/components/meal-plan/MacrosChart';
import CopyModelDialog from '@/components/meal-plan/CopyModelDialog';
import TemplateManagerDialog from '@/components/meal-plan/TemplateManagerDialog';
import {
    getMealPlans,
    getActiveMealPlan,
    getMealPlanById,
    getMealPlanVersions,
    getReferenceValues,
    createMealPlan,
    updateFullMealPlan,
    restoreMealPlanVersion,
    deleteMealPlan,
    archiveMealPlan,
    setActiveMealPlan,
    copyMealPlan,
    copyMealPlanToPatient,
    addMealToPlan,
    addFoodToMeal,
    savePlanAsTemplate,
    promoteDraftToActive,
    saveDraftAsPlan,
    getDraftMealPlan,
    getDraftMealPlans,
    deleteDraftMealPlan,
    deleteAllDraftMealPlans,
    createDraftMealPlan
} from '@/lib/supabase/meal-plan-queries';
import { supabase } from '@/lib/customSupabaseClient';
import { exportMealPlanToPdf } from '@/lib/pdfUtils';
import { generateShoppingList } from '@/lib/pdf/shoppingListGenerator';
import { translateMealType } from '@/utils/mealTranslations';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';
import { useAuth } from '@/contexts/AuthContext';
import { patientHubRoute, patientRoute } from '@/lib/utils/patientRoutes';
import { getLatestEnergyCalculation } from '@/lib/supabase/energy-queries';
import PlanTargetMonitor from '@/components/meal-plan/PlanTargetMonitor';
import NotificationCenter from '@/components/meal-plan/NotificationCenter';
import { getPatientModuleSyncFlags, clearPatientModuleSyncFlags } from '@/lib/supabase/anthropometry-queries';
import { useMealPlan } from '@/hooks/useMealPlan';

const MealPlanPage = () => {
    const { patientId, paramValue } = useResolvedPatientId();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();

    const { plans, activePlan, pendingDrafts, loading, isFetching, loadPlans, invalidatePlans } = useMealPlan(patientId, nutritionistId);

    const [submitting, setSubmitting] = useState(false);
    const [patientName, setPatientName] = useState('');
    const [referenceValues, setReferenceValues] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingPlan, setEditingPlan] = useState(null);
    const [nutritionistId, setNutritionistId] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [planToDelete, setPlanToDelete] = useState(null);
    const [copyModelDialogOpen, setCopyModelDialogOpen] = useState(false);
    const [planToCopy, setPlanToCopy] = useState(null);
    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [templateManagerOpen, setTemplateManagerOpen] = useState(false);
    const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [templateTags, setTemplateTags] = useState('');
    const [mealPlanVersions, setMealPlanVersions] = useState([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [selectedVersionId, setSelectedVersionId] = useState('');
    const [restoringVersion, setRestoringVersion] = useState(false);
    const [energyCalculation, setEnergyCalculation] = useState(null);
    const [syncFlags, setSyncFlags] = useState(null);
    const [pendingDraft, setPendingDraft] = useState(null); // rascunho específico sendo retomado no momento no form
    const [discardingDraft, setDiscardingDraft] = useState(false);
    const [draftToDelete, setDraftToDelete] = useState(null); // Para o modal de confirmação de descarte de rascunho
    const [discardAllDraftsDialogOpen, setDiscardAllDraftsDialogOpen] = useState(false);
    const [plansModalOpen, setPlansModalOpen] = useState(false);
    const [plansSearchTerm, setPlansSearchTerm] = useState('');
    const [versionsExpanded, setVersionsExpanded] = useState(false);
    const [fullActivePlan, setFullActivePlan] = useState(null);
    const [newPlanChoiceOpen, setNewPlanChoiceOpen] = useState(false);

    // Obter ID do nutricionista
    useEffect(() => {
        const getNutritionistId = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setNutritionistId(user.id);
            }
        };
        getNutritionistId();
    }, []);

    // Carregar nome do paciente
    useEffect(() => {
        const loadPatientName = async () => {
            if (!patientId) return;

            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('name')
                    .eq('id', patientId)
                    .single();

                if (!error && data) {
                    setPatientName(data.name);
                }
            } catch (error) {
                console.error('Erro ao carregar nome do paciente:', error);
            }
        };
        loadPatientName();
    }, [patientId]);

    // Carregar planos + rascunhos em paralelo agora é gerenciado pelo useMealPlan hook.
    // As chamadas a loadPlans() nas dependências dos effects ainda existem, mas como um refetch.

    // Carregar valores de referência quando activePlan mudar
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

    // Lazy load full plan data for micros tab
    useEffect(() => {
        const loadFullPlan = async () => {
            if (!activePlan?.id) { setFullActivePlan(null); return; }
            try {
                const { data } = await getMealPlanById(activePlan.id);
                setFullActivePlan(data);
            } catch (e) {
                console.error('Erro ao carregar plano completo:', e);
            }
        };
        loadFullPlan();
    }, [activePlan?.id]);

    // Carregar cálculo de energia
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

    // O checkPendingDraft foi incorporado ao loadPlans acima para garantir sincronia
    // Mantemos apenas o trigger quando nutritionistId muda (resolvido antes dos planos)
    useEffect(() => {
        if (patientId && nutritionistId) loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [patientId, nutritionistId]);

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

        // Re-carregar a lista completa para garantir sincronia e contador correto
        const { data: updatedDrafts } = await getDraftMealPlans(patientId, nutritionistId);
        setPendingDrafts(updatedDrafts || []);

        // Se estiver descartando o que está aberto no momento no form
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
            setPendingDrafts([]);
            setPendingDraft(null); // Limpa o rascunho ativo no form se houver
            setDiscardAllDraftsDialogOpen(false);
            toast({ title: 'Todos os rascunhos foram descartados', variant: 'default' });
        }
    };

    const handleResumePendingDraft = async (draft = null) => {
        // Se nenhum draft for passado, retoma o MAIS RECENTE da fila (banner)
        const targetDraft = draft || (pendingDrafts.length > 0 ? pendingDrafts[0] : null);
        if (!targetDraft) return;

        // Busca o plano completo (com refeições e alimentos) antes de abrir o form
        // Isso garante que as macros serão hidratadas corretamente
        const { data: fullDraft } = await getMealPlanById(targetDraft.id);

        setEditingPlan(null);
        setPendingDraft(fullDraft || targetDraft); 
        setShowForm(true);
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

        return date.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatSyncUpdateTime = (isoDate) => {
        if (!isoDate) return null;
        const date = new Date(isoDate);
        if (Number.isNaN(date.getTime())) return null;

        const diffMs = Date.now() - date.getTime();
        if (diffMs < 0) return `atualizado em ${date.toLocaleString('pt-BR')}`;

        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return 'atualizado agora';
        if (minutes < 60) return `atualizado há ${minutes} min`;

        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `atualizado há ${hours}h`;

        const days = Math.floor(hours / 24);
        if (days <= 7) return `atualizado há ${days} dia${days > 1 ? 's' : ''}`;

        return `atualizado em ${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
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

    // Returns a unique plan name, deduplicating against all existing plan names
    const resolveUniquePlanName = (rawName, existingPlans, excludePlanId = null) => {
        const base = rawName?.trim() || 'Plano Alimentar sem Nome';

        // Collect names of all existing plans (excluding self when editing)
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

    // Criar ou atualizar plano — botão "Aplicar Plano Alimentar"
    const handleSubmit = async (planData, planId = null) => {
        setSubmitting(true);


        try {
            // Resolve a unique, non-empty plan name before saving
            const resolvedName = resolveUniquePlanName(planData.name, plans, planId);
            const finalPlanData = { ...planData, name: resolvedName };

            if (planId) {
                // Atualizar plano existente
                const result = await updateFullMealPlan(planId, finalPlanData);
                if (result.error) throw result.error;
            } else if (finalPlanData.draftId) {
                // Novo plano via rascunho: promove para ativo e atualiza metadados
                // Primeiro atualizamos tudo no rascunho para garantir que não haja perda de dados
                const syncResult = await updateFullMealPlan(finalPlanData.draftId, finalPlanData);
                if (syncResult.error) throw syncResult.error;

                const result = await promoteDraftToActive(finalPlanData.draftId, patientId);
                if (result.error) throw result.error;
            } else {

                // Fallback: criação tradicional (sem rascunho prévio)
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

                // Preencher o plano com as refeições/alimentos usando o novo motor de batch
                const updateResult = await updateFullMealPlan(result.data.id, finalPlanData);
                if (updateResult.error) throw updateResult.error;
            }

            toast({
                title: 'Sucesso',
                description: planId
                    ? 'Plano atualizado com sucesso'
                    : 'Plano aplicado com sucesso',
                variant: 'success'
            });

            const { error: clearError } = await clearPatientModuleSyncFlags(patientId, { mealPlan: true });
            if (clearError) {
                console.warn('Não foi possível limpar flag de revisão do plano automaticamente:', clearError);
            } else {
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
                description: error?.message || 'Não foi possível salvar o plano alimentar. Seus dados estão preservados no rascunho.',
                variant: 'destructive'
            });
            // Form stays open — data is safe in the draft
        } finally {
            setSubmitting(false);
        }
    };

    // Salvar plano sem ativar
    const handleSaveDraft = async (planData) => {
        setSubmitting(true);
        try {
            const resolvedName = resolveUniquePlanName(planData.name, plans);
            const finalPlanData = { ...planData, name: resolvedName };

            let result;
            if (finalPlanData.draftId) {
                // Sync UI state to DB first
                const updateResult = await updateFullMealPlan(finalPlanData.draftId, { ...finalPlanData, is_active: false });
                if (updateResult.error) throw updateResult.error;

                // Convert draft to a "Saved" (inactive) plan
                result = await saveDraftAsPlan(finalPlanData.draftId);
                if (result.error) throw result.error;
            } else {
                // Fallback creation without draft
                result = await createMealPlan({
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

                // Preencher o plano com as refeições/alimentos usando o novo motor de batch
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

    // Editar plano
    const handleEdit = async (planId) => {
        try {
            const result = await getMealPlanById(planId);
            if (result.error) throw result.error;

            setEditingPlan(result.data);
            setShowForm(true);
        } catch (error) {
            console.error('Erro ao carregar plano para edição:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar o plano para edição',
                variant: 'destructive'
            });
        }
    };

    // Arquivar plano
    const handleArchive = async (planId) => {
        try {
            const result = await archiveMealPlan(planId);
            if (result.error) throw result.error;

            toast({
                title: 'Sucesso',
                description: 'Plano arquivado com sucesso',
                variant: 'success'
            });

            await loadPlans();
        } catch (error) {
            console.error('Erro ao arquivar plano:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível arquivar o plano',
                variant: 'destructive'
            });
        }
    };

    // Ativar plano (desativa outros automaticamente)
    const handleSetActive = async (planId) => {
        try {
            const result = await setActiveMealPlan(planId);
            if (result.error) throw result.error;

            toast({
                title: 'Sucesso',
                description: 'Plano ativado com sucesso',
                variant: 'success'
            });

            await loadPlans();
        } catch (error) {
            console.error('Erro ao ativar plano:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível ativar o plano',
                variant: 'destructive'
            });
        }
    };

    // Copiar modelo (abre modal de seleção de paciente)
    const handleCopy = (planId) => {
        const plan = plans.find(p => p.id === planId) || activePlan;
        if (plan) {
            setPlanToCopy(plan);
            setCopyModelDialogOpen(true);
        }
    };

    // Copiar plano para outro paciente
    const handleCopyToPatient = async (targetPatientId) => {
        try {
            const result = await copyMealPlanToPatient(planToCopy.id, targetPatientId);
            if (result.error) throw result.error;

            toast({
                title: 'Sucesso',
                description: `Plano copiado para o paciente com sucesso`,
                variant: 'success'
            });

            setCopyModelDialogOpen(false);
            setPlanToCopy(null);
        } catch (error) {
            console.error('Erro ao copiar modelo:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível copiar o modelo para o paciente',
                variant: 'destructive'
            });
        }
    };

    // Gerar lista de compras em PDF
    const handleGenerateShoppingList = async () => {
        if (!activePlan) {
            toast({
                title: 'Erro',
                description: 'Nenhum plano ativo encontrado.',
                variant: 'destructive'
            });
            return;
        }

        try {
            // Carregar dados completos do plano (com foods detalhados)
            const result = await getMealPlanById(activePlan.id);
            if (result.error) throw result.error;

            const fullPlan = result.data;

            await generateShoppingList(fullPlan, patientName);
            toast({
                title: 'Lista de Compras gerada!',
                description: 'O PDF foi baixado com sucesso.',
            });
        } catch (error) {
            console.error('Erro ao gerar lista de compras:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível gerar a lista de compras. Tente novamente.',
                variant: 'destructive'
            });
        }
    };

    // Exportar plano para PDF
    const handleExportPDF = async (includeNutrients) => {
        if (!activePlan) return;

        try {
            setExportDialogOpen(false);

            // Carregar dados completos do plano
            const result = await getMealPlanById(activePlan.id);
            if (result.error) throw result.error;

            const fullPlan = result.data;

            await exportMealPlanToPdf(
                fullPlan,
                patientName,
                user?.profile?.name,
                includeNutrients,
                translateMealType,
                formatQuantityWithUnit
            );

            toast({
                title: 'PDF gerado!',
                description: 'Plano alimentar exportado com sucesso.',
                variant: 'success'
            });
        } catch (error) {
            console.error('Erro ao exportar PDF:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível exportar o plano alimentar',
                variant: 'destructive'
            });
        }
    };

    // Deletar plano
    const handleDelete = async () => {
        if (!planToDelete) return;

        try {
            const result = await deleteMealPlan(planToDelete);
            if (result.error) throw result.error;

            toast({
                title: 'Sucesso',
                description: 'Plano deletado com sucesso',
                variant: 'success'
            });

            setPlanToDelete(null);
            setDeleteDialogOpen(false);
            await loadPlans();
        } catch (error) {
            console.error('Erro ao deletar plano:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível deletar o plano',
                variant: 'destructive'
            });
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return null;
        return new Date(dateString).toLocaleDateString('pt-BR');
    };

    const getDaysLabel = (activeDays) => {
        if (!activeDays || activeDays.length === 0) return 'Nenhum dia';
        if (activeDays.length === 7) return 'Todos os dias';

        const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
        const weekends = ['saturday', 'sunday'];

        const isWeekdays = weekdays.every(day => activeDays.includes(day)) &&
            !weekends.some(day => activeDays.includes(day));
        const isWeekends = weekends.every(day => activeDays.includes(day)) &&
            !weekdays.some(day => activeDays.includes(day));

        if (isWeekdays) return 'Dias úteis';
        if (isWeekends) return 'Fins de semana';

        return `${activeDays.length} dias`;
    };

    // Salvar plano como template
    const handleSaveAsTemplate = async () => {
        if (!activePlan || !templateName.trim()) return;

        setSubmitting(true);
        try {
            // Converter tags de string separada por vírgula para array
            const tagsArray = templateTags
                ? templateTags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
                : [];

            const { data, error } = await savePlanAsTemplate(activePlan.id, templateName.trim(), tagsArray);
            if (error) throw error;

            toast({
                title: 'Template Salvo',
                description: `O plano foi salvo como template "${templateName}" com sucesso.`,
                variant: 'success'
            });

            setSaveTemplateDialogOpen(false);
            setTemplateName('');
            setTemplateTags('');
        } catch (error) {
            console.error('Erro ao salvar template:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível salvar o template.',
                variant: 'destructive'
            });
        } finally {
            setSubmitting(false);
        }
    };

    // Handler quando template é aplicado
    const handleTemplateApplied = async (newPlan) => {
        invalidatePlans();
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

    const selectedVersion = mealPlanVersions.find((version) => String(version.id) === String(selectedVersionId)) || null;
    const currentMetrics = activePlan ? {
        calories: Number(activePlan.daily_calories || 0),
        protein: Number(activePlan.daily_protein || 0),
        carbs: Number(activePlan.daily_carbs || 0),
        fat: Number(activePlan.daily_fat || 0),
        mealsCount: Number(activePlan.meals?.length || 0)
    } : null;
    const baseMetrics = selectedVersion ? getMetricsFromSnapshot(selectedVersion.snapshot) : null;

    const buildDelta = (currentValue, baseValue) => {
        const delta = Number(currentValue || 0) - Number(baseValue || 0);
        return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
    };

    const handleRestoreVersion = async () => {
        if (!selectedVersion) return;
        const confirmRestore = window.confirm(`Deseja restaurar a versão ${selectedVersion.version_number}? Isso criará uma nova versão de rollback.`);
        if (!confirmRestore) return;

        setRestoringVersion(true);
        try {
            const result = await restoreMealPlanVersion(selectedVersion.id);
            if (result.error) throw result.error;

            toast({
                title: 'Versão restaurada',
                description: `O plano foi restaurado a partir da versão ${selectedVersion.version_number}.`,
                variant: 'success'
            });

            await loadPlans();
        } catch (error) {
            console.error('Erro ao restaurar versão do plano:', error);
            toast({
                title: 'Erro ao restaurar versão',
                description: 'Não foi possível concluir a restauração desta versão.',
                variant: 'destructive'
            });
        } finally {
            setRestoringVersion(false);
        }
    };

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-24" />
                    <Skeleton className="h-10 w-32" />
                </div>
                <Skeleton className="h-12 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                    <Skeleton className="h-[400px] w-full" />
                    <div className="md:col-span-2 space-y-4">
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-32 w-full" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (showForm) {
        return (
            <div className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                            setShowForm(false);
                            setEditingPlan(null);
                        }}
                    >
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        Voltar
                    </Button>
                </div>

                <MealPlanForm
                    patientId={patientId}
                    patientSlugOrId={paramValue}
                    nutritionistId={nutritionistId}
                    initialData={editingPlan}
                    pendingDraft={!editingPlan ? pendingDraft : null}
                    onSubmit={handleSubmit}
                    onSaveDraft={handleSaveDraft}
                    onCancel={() => {
                        setShowForm(false);
                        setEditingPlan(null);
                        setPendingDraft(null);
                    }}
                    onDraftDiscarded={() => setPendingDraft(null)}
                    loading={submitting}
                />
            </div>
        );
    }

    return (
        <div className={`container mx-auto px-4 py-6 sm:py-8 max-w-6xl transition-opacity duration-200 ${isFetching ? 'opacity-70 pointer-events-none' : 'opacity-100'}`}>
            {/* Header */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(patientHubRoute({ id: patientId, slug: paramValue }, 'nutrition'))}
                        className="gap-2 -ml-2 shrink-0 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10 font-bold"
                    >
                        <ArrowLeft className="w-4 h-4 shrink-0" />
                        Voltar
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadPlans} className="flex-shrink-0 border-2 font-bold h-9">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Atualizar
                    </Button>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
                            <Utensils className="w-6 h-6 sm:w-8 sm:h-8 text-[#5f6f52]" />
                            <span className="truncate">Planos Alimentares</span>
                        </h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Gerencie os planos alimentares do paciente
                        </p>
                    </div>
                    <div className="flex gap-2 w-full sm:w-auto">
                        {activePlan && plans.length > 0 && (
                            <Button size="sm" variant="outline" onClick={() => setPlansModalOpen(true)} className="flex-1 sm:flex-initial gap-2 border-2 h-10 font-bold">
                                <FolderOpen className="h-4 w-4" />
                                Meus Planos
                                <Badge variant="outline" className="ml-1 h-5 min-w-[20px] px-1 justify-center border-[#5f6f52] text-[#5f6f52] font-black">{plans.length}</Badge>
                            </Button>
                        )}
                        <Button 
                            size="sm" 
                            onClick={() => setNewPlanChoiceOpen(true)} 
                            className="flex-1 sm:flex-initial h-10 px-6 font-bold bg-primary hover:bg-primary/90 text-white transition-all active:scale-95 shadow-sm"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Novo Plano
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-[3px]">
                {/* Centro de Notificações Inteligentes */}
                {!showForm && (
                    <NotificationCenter 
                        isDiscarding={discardingDraft}
                        pendingDrafts={pendingDrafts}
                        syncFlags={syncFlags}
                        onDiscardDraft={(draft) => setDraftToDelete(draft)}
                        onDiscardAllDrafts={() => setDiscardAllDraftsDialogOpen(true)}
                        onResumeDraft={handleResumePendingDraft}
                        onMarkAsReviewed={handleMarkMealPlanAsReviewed}
                        onReviewNow={() => {
                            if (activePlan?.id) {
                                handleEdit(activePlan.id);
                            } else {
                                setShowForm(true);
                            }
                        }}
                    />
                )}

                {/* Target Monitor - Status do GET vs Plano */}
                <PlanTargetMonitor
                    targetCalories={energyCalculation?.final_planned_kcal ?? energyCalculation?.get_with_activities ?? energyCalculation?.get ?? energyCalculation?.get_result ?? null}
                    currentCalories={activePlan?.daily_calories || 0}
                    patientId={patientId}
                    patientSlugOrId={paramValue}
                    energyCalculation={energyCalculation}
                />

                {/* Plano Ativo */}
                {activePlan && (
                <Card className="border-primary shadow-sm">
                    <CardHeader>
                        <div className="flex flex-col gap-4">
                            {/* Título e Badge */}
                            <div className="flex items-center justify-between gap-3">
                                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                                    <span className="break-words">{activePlan.name}</span>
                                    <Badge className="bg-primary">Ativo</Badge>
                                </CardTitle>

                                {/* Botões de Ação - Reorganizados */}
                                <div className="flex items-center gap-2">
                                    {/* Editar Plano - PRIMÁRIO */}
                                    <Button
                                        size="sm"
                                        onClick={() => handleEdit(activePlan.id)}
                                        className="hidden sm:flex bg-[#5f6f52] hover:bg-[#4a5740] text-white font-bold h-9 px-4 shadow-sm"
                                    >
                                        <Edit className="h-4 w-4 mr-2" />
                                        Editar Plano
                                    </Button>
                                    {/* Exportar PDF - SECUNDÁRIO VISÍVEL */}
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setExportDialogOpen(true)}
                                        className="hidden sm:flex"
                                    >
                                        <Download className="h-4 w-4 mr-2" />
                                        Exportar PDF
                                    </Button>

                                    {/* Dropdown de Ações Secundárias */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-56">
                                            {/* Mobile: Mostrar ações principais também */}
                                            <div className="sm:hidden">
                                                <DropdownMenuItem onClick={() => handleEdit(activePlan.id)}>
                                                    <Edit className="h-4 w-4 mr-2" />
                                                    Editar Plano
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                                                    <Download className="h-4 w-4 mr-2" />
                                                    Exportar PDF
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                            </div>

                                            {/* Ações secundárias */}
                                            <DropdownMenuItem onClick={() => navigate(patientRoute({ id: patientId, slug: paramValue }, `meal-plan/${activePlan.id}/summary`))}>
                                                <BarChart3 className="h-4 w-4 mr-2" />
                                                Resumo Nutricional
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={handleGenerateShoppingList}>
                                                <ShoppingCart className="h-4 w-4 mr-2" />
                                                Lista de Compras
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleCopy(activePlan.id)}>
                                                <Send className="h-4 w-4 mr-2" />
                                                Enviar para Paciente
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => {
                                                setSaveTemplateDialogOpen(true);
                                            }}>
                                                <Save className="h-4 w-4 mr-2" />
                                                Salvar como Template
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => handleArchive(activePlan.id)}
                                                className="text-destructive focus:text-destructive"
                                            >
                                                <Archive className="h-4 w-4 mr-2" />
                                                Arquivar Plano
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {activePlan.description && (
                            <p className="text-muted-foreground mb-4">{activePlan.description}</p>
                        )}

                        {/* Metadata Grid com Ícones */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                            <div className="p-3 rounded-lg border bg-muted/20">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                    <Calendar className="w-3.5 h-3.5" />
                                    Início
                                </div>
                                <div className="font-semibold text-sm">{formatDate(activePlan.start_date)}</div>
                            </div>
                            <div className="p-3 rounded-lg border bg-muted/20">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                    <CalendarCheck className="w-3.5 h-3.5" />
                                    Término
                                </div>
                                <div className="font-semibold text-sm">
                                    {activePlan.end_date ? formatDate(activePlan.end_date) : 'Indeterminado'}
                                </div>
                            </div>
                            <div className="p-3 rounded-lg border bg-muted/20">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                    <CalendarDays className="w-3.5 h-3.5" />
                                    Dias Ativos
                                </div>
                                <div className="font-semibold text-sm">{getDaysLabel(activePlan.active_days)}</div>
                            </div>
                            <div className="p-3 rounded-lg border bg-muted/20">
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                                    <UtensilsCrossed className="w-3.5 h-3.5" />
                                    Refeições
                                </div>
                                <div className="font-semibold text-sm">{activePlan.meals?.length || 0}</div>
                            </div>
                        </div>

                        {/* Grid: Refeições (60%) + Painel Nutricional (40%) */}
                        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                            {/* Refeições - 60% */}
                            <div className="lg:col-span-6">
                                {activePlan.meals && activePlan.meals.length > 0 ? (
                                    <div className="space-y-2">
                                        <div className="font-semibold mb-3 flex items-center gap-2">
                                            <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
                                            Refeições
                                        </div>
                                        {activePlan.meals.map((meal, index) => {
                                            const mealCalPct = activePlan.daily_calories > 0
                                                ? ((meal.total_calories || 0) / activePlan.daily_calories) * 100
                                                : 0;
                                            const mealColors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe', '#00c49f', '#ffbb28', '#ff6b6b', '#a57ed0'];
                                            const mealColor = mealColors[index % mealColors.length];

                                            return (
                                                <div key={meal.id} className="group p-3 border rounded-lg bg-background hover:shadow-sm transition-all duration-150">
                                                    <div className="flex items-center gap-3">
                                                        {/* Color indicator */}
                                                        <div
                                                            className="w-1 h-10 rounded-full flex-shrink-0"
                                                            style={{ backgroundColor: mealColor }}
                                                        />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <div className="font-medium text-sm truncate">
                                                                    {meal.name}
                                                                </div>
                                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                                    {meal.meal_time && (
                                                                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                                                                            {meal.meal_time}
                                                                        </span>
                                                                    )}
                                                                    <span className="text-xs font-semibold" style={{ color: mealColor }}>
                                                                        {(meal.total_calories || 0).toFixed(0)} kcal
                                                                    </span>
                                                                </div>
                                                            </div>
                                                            {/* Calorie % bar */}
                                                            <div className="flex items-center gap-2 mt-1.5">
                                                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full rounded-full transition-all duration-500"
                                                                        style={{ width: `${Math.min(mealCalPct, 100)}%`, backgroundColor: mealColor, opacity: 0.7 }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground w-8 text-right">
                                                                    {mealCalPct.toFixed(0)}%
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                                                {meal.foods?.length || 0} alimento(s)
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <Alert>
                                        <AlertDescription>
                                            Nenhuma refeição adicionada ainda.
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>

                            {/* Painel Nutricional - 40% */}
                            <div className="lg:col-span-4">
                                <MacrosChart
                                    protein={activePlan.daily_protein || 0}
                                    carbs={activePlan.daily_carbs || 0}
                                    fat={activePlan.daily_fat || 0}
                                    calories={activePlan.daily_calories || 0}
                                    patientId={patientId}
                                    patientSlugOrId={paramValue}
                                    planId={null}
                                    referenceValues={referenceValues}
                                    onReferenceUpdate={null}
                                    readOnly={true}
                                    plan={fullActivePlan}
                                    activePlanId={activePlan.id}
                                />
                            </div>
                        </div>

                        {/* Histórico de Versões - Colapsável */}
                        {mealPlanVersions.length > 0 && (
                            <div className="mt-6 border-t pt-4">
                                <button
                                    type="button"
                                    onClick={() => setVersionsExpanded(!versionsExpanded)}
                                    className="flex items-center justify-between w-full group"
                                >
                                    <div className="flex items-center gap-2">
                                        <History className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-sm font-semibold text-foreground">Histórico de Versões</span>
                                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{mealPlanVersions.length}</Badge>
                                        <div className="relative">
                                            <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help peer" />
                                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2.5 bg-foreground text-background text-xs rounded-lg shadow-lg opacity-0 pointer-events-none peer-hover:opacity-100 transition-opacity z-50">
                                                Cada vez que você salva uma edição no plano, uma versão é criada automaticamente. Compare mudanças e restaure versões anteriores.
                                            </div>
                                        </div>
                                    </div>
                                    {versionsExpanded ? (
                                        <ChevronUp className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    )}
                                </button>

                                {versionsExpanded && (
                                    <div className="mt-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                        <div className="grid gap-3 md:grid-cols-[1fr_auto] items-end">
                                            <div>
                                                <label className="text-sm font-medium text-foreground">Comparar plano atual com versão</label>
                                                <select
                                                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                                    value={selectedVersionId}
                                                    onChange={(event) => setSelectedVersionId(event.target.value)}
                                                >
                                                    {mealPlanVersions.map((version) => (
                                                        <option key={version.id} value={String(version.id)}>
                                                            Versão {version.version_number} • {new Date(version.created_at).toLocaleString('pt-BR')}
                                                            {version.is_rollback ? ' • rollback' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <Button
                                                variant="outline"
                                                disabled={!selectedVersion || restoringVersion}
                                                onClick={handleRestoreVersion}
                                            >
                                                {restoringVersion ? 'Restaurando...' : 'Restaurar versão'}
                                            </Button>
                                        </div>

                                        {selectedVersion && currentMetrics && baseMetrics ? (
                                            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                                <div className="rounded-lg border p-3">
                                                    <p className="text-xs text-muted-foreground">Kcal/dia</p>
                                                    <p className="text-lg font-semibold">{currentMetrics.calories.toFixed(0)}</p>
                                                    <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.calories, baseMetrics.calories)}</p>
                                                </div>
                                                <div className="rounded-lg border p-3">
                                                    <p className="text-xs text-muted-foreground">Proteína</p>
                                                    <p className="text-lg font-semibold">{currentMetrics.protein.toFixed(1)} g</p>
                                                    <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.protein, baseMetrics.protein)}</p>
                                                </div>
                                                <div className="rounded-lg border p-3">
                                                    <p className="text-xs text-muted-foreground">Carboidratos</p>
                                                    <p className="text-lg font-semibold">{currentMetrics.carbs.toFixed(1)} g</p>
                                                    <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.carbs, baseMetrics.carbs)}</p>
                                                </div>
                                                <div className="rounded-lg border p-3">
                                                    <p className="text-xs text-muted-foreground">Gorduras</p>
                                                    <p className="text-lg font-semibold">{currentMetrics.fat.toFixed(1)} g</p>
                                                    <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.fat, baseMetrics.fat)}</p>
                                                </div>
                                                <div className="rounded-lg border p-3">
                                                    <p className="text-xs text-muted-foreground">Refeições</p>
                                                    <p className="text-lg font-semibold">{currentMetrics.mealsCount}</p>
                                                    <p className="text-xs text-muted-foreground">Delta: {buildDelta(currentMetrics.mealsCount, baseMetrics.mealsCount)}</p>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Lista de Planos - Inline quando NÃO tem plano ativo */}
            {!activePlan && (
                <Card>
                    <CardHeader>
                        <CardTitle>Todos os Planos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pendingDrafts.length === 0 && plans.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <div className="p-4 bg-muted/20 rounded-full mb-4">
                                    <Utensils className="w-12 h-12 text-muted-foreground opacity-20" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">Nenhum Plano Ativo</h3>
                                <p className="text-muted-foreground max-w-md mb-8">
                                    Este paciente ainda não possui um plano alimentar ativo. 
                                    Crie um novo plano ou utilize um modelo para começar.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4 w-full justify-center px-4">
                                    <Button 
                                        onClick={() => {
                                            setPendingDraft(null);
                                            setEditingPlan(null);
                                            setShowForm(true);
                                        }}
                                        size="lg"
                                        className="font-bold h-12 px-8 bg-primary hover:bg-primary/90 text-white w-full sm:w-auto shadow-md"
                                    >
                                        <Plus className="w-5 h-5 mr-2" />
                                        Criar Primeiro Plano
                                    </Button>
                                    <Button 
                                        variant="outline" 
                                        size="lg"
                                        onClick={() => setTemplateManagerOpen(true)}
                                        className="font-bold h-12 px-8 border-2 w-full sm:w-auto"
                                    >
                                        <Copy className="w-5 h-5 mr-2" />
                                        Usar Modelo
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pendingDrafts.map((draft) => (
                                    <div key={draft.id} className="p-4 border-2 border-amber-200 bg-amber-50/50 border-dashed rounded-lg transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-amber-900">{draft.name || 'Novo Plano Alimentar'}</h3>
                                                    <Badge className="bg-amber-500 hover:bg-amber-600">Rascunho</Badge>
                                                </div>
                                                <div className="text-sm text-amber-700/80 mt-1">
                                                    {formatRelativeTime(draft.updated_at)} • Pendente
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button variant="outline" size="sm" className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100" onClick={() => handleResumePendingDraft(draft)} title="Retomar edição">
                                                    <Edit className="h-4 w-4 mr-2" />Retomar
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-destructive hover:bg-red-50 hover:text-destructive" onClick={() => setDraftToDelete(draft)} disabled={discardingDraft} title="Descartar rascunho">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {plans.map((plan) => (
                                    <div key={plan.id} className="p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold">{plan.name}</h3>
                                                    {plan.is_active && <Badge variant="outline" className="border-green-300 text-green-700">Ativo</Badge>}
                                                    {!plan.is_active && <Badge variant="secondary">Arquivado</Badge>}
                                                </div>
                                                <div className="text-sm text-muted-foreground mt-1">
                                                    {formatDate(plan.start_date)}
                                                    {plan.end_date && ` até ${formatDate(plan.end_date)}`}
                                                    {' '}• {getDaysLabel(plan.active_days)}
                                                    {' '}• {plan.daily_calories?.toFixed(0) || 0} kcal/dia
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                {!plan.is_active && (
                                                    <Button variant="default" size="sm" onClick={() => handleSetActive(plan.id)} title="Ativar este plano">
                                                        <RefreshCw className="h-4 w-4" />
                                                    </Button>
                                                )}
                                                <Button variant="outline" size="sm" onClick={() => handleEdit(plan.id)} title="Editar plano">
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => handleCopy(plan.id)} title="Enviar para paciente">
                                                    <Send className="h-4 w-4" />
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => { setPlanToDelete(plan.id); setDeleteDialogOpen(true); }} title="Deletar plano">
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
            </div>



            {/* Modal "Meus Planos" - quando plano ativo existe */}
            <Dialog open={plansModalOpen} onOpenChange={(open) => { setPlansModalOpen(open); if (!open) setPlansSearchTerm(''); }}>
                <DialogContent className="max-w-3xl max-h-[80vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderOpen className="h-5 w-5 text-primary" />
                            Planos Alimentares
                        </DialogTitle>
                        <DialogDescription>
                            {plans.length} plano(s) • {pendingDrafts.length} rascunho(s)
                        </DialogDescription>
                    </DialogHeader>

                    {/* Busca */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por nome do plano..."
                            value={plansSearchTerm}
                            onChange={(e) => setPlansSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    <div className="overflow-y-auto max-h-[50vh] space-y-2 pr-1">
                        {/* Rascunhos */}
                        {pendingDrafts.filter(d => !plansSearchTerm || (d.name || '').toLowerCase().includes(plansSearchTerm.toLowerCase())).map((draft) => (
                            <div key={draft.id} className="p-3 border-2 border-amber-200 bg-amber-50/50 border-dashed rounded-lg">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-sm text-amber-900 truncate">{draft.name || 'Novo Plano'}</h4>
                                            <Badge className="bg-amber-500 hover:bg-amber-600 shrink-0 text-[10px]">Rascunho</Badge>
                                        </div>
                                        <p className="text-xs text-amber-700/70 mt-0.5">{formatRelativeTime(draft.updated_at)}</p>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                        <Button variant="outline" size="sm" className="h-8 border-amber-300 text-amber-800" onClick={() => { handleResumePendingDraft(draft); setPlansModalOpen(false); }}>
                                            <Edit className="h-3.5 w-3.5 mr-1" />Retomar
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDraftToDelete(draft)}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Planos salvos */}
                        {plans.filter(p => !plansSearchTerm || p.name.toLowerCase().includes(plansSearchTerm.toLowerCase())).map((plan) => (
                            <div key={plan.id} className="p-3 border rounded-lg hover:bg-muted/30 transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="font-semibold text-sm truncate">{plan.name}</h4>
                                            {plan.is_active && <Badge variant="outline" className="border-green-300 text-green-700 shrink-0 text-[10px]">Ativo</Badge>}
                                            {!plan.is_active && <Badge variant="secondary" className="shrink-0 text-[10px]">Arquivado</Badge>}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {formatDate(plan.start_date)}
                                            {plan.end_date && ` → ${formatDate(plan.end_date)}`}
                                            {' '}• {plan.daily_calories?.toFixed(0) || 0} kcal/dia
                                        </p>
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                        {!plan.is_active && (
                                            <Button variant="default" size="icon" className="h-8 w-8" onClick={() => { handleSetActive(plan.id); setPlansModalOpen(false); }} title="Ativar">
                                                <RefreshCw className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { handleEdit(plan.id); setPlansModalOpen(false); }} title="Editar">
                                            <Edit className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleCopy(plan.id)} title="Enviar para paciente">
                                            <Send className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setPlanToDelete(plan.id); setDeleteDialogOpen(true); }} title="Deletar">
                                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {plans.filter(p => !plansSearchTerm || p.name.toLowerCase().includes(plansSearchTerm.toLowerCase())).length === 0 &&
                         pendingDrafts.filter(d => !plansSearchTerm || (d.name || '').toLowerCase().includes(plansSearchTerm.toLowerCase())).length === 0 && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                Nenhum plano encontrado
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog de Confirmação de Exclusão de Rascunho */}
            <AlertDialog open={!!draftToDelete} onOpenChange={(open) => !open && setDraftToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Descarte de Rascunho</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja descartar o rascunho <strong>"{draftToDelete?.name || 'Novo Plano'}"</strong>?
                            {draftToDelete && (
                                <div className="mt-4 p-3 bg-muted rounded-md text-sm space-y-1">
                                    <p className="font-semibold text-foreground">Conteúdo do rascunho:</p>
                                    <ul className="list-disc list-inside text-muted-foreground">
                                        <li>{draftToDelete.meals?.length || 0} refeições configuradas</li>
                                        <li>
                                            {(draftToDelete.meals || []).reduce((acc, meal) => acc + (meal.items?.length || 0), 0)} alimentos adicionados
                                        </li>
                                    </ul>
                                </div>
                            )}
                            <p className="mt-4 text-destructive font-medium">Esta ação não pode ser desfeita.</p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDraftToDelete(null)}>
                            Manter rascunho
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={async () => {
                                const id = draftToDelete.id;
                                setDraftToDelete(null);
                                await handleDiscardPendingDraft(id);
                            }} 
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {discardingDraft ? 'Descartando...' : 'Descartar rascunho'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dialog de Descartar TODOS os Rascunhos */}
            <AlertDialog open={discardAllDraftsDialogOpen} onOpenChange={setDiscardAllDraftsDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-destructive">Descartar TODOS os Rascunhos?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação removerá permanentemente os <strong>{pendingDrafts.length} rascunhos</strong> deste paciente.
                            Planos alimentares já ativos ou arquivados não serão afetados.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setDiscardAllDraftsDialogOpen(false)}>
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleDiscardAllDrafts} 
                            className="bg-destructive hover:bg-destructive/90"
                        >
                            {discardingDraft ? 'Descartando...' : 'Descartar Tudo'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dialog de Confirmação de Exclusão */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja deletar este plano alimentar? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setPlanToDelete(null)}>
                            Cancelar
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive">
                            Deletar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Dialog de Copiar Modelo */}
            <CopyModelDialog
                isOpen={copyModelDialogOpen}
                onClose={() => {
                    setCopyModelDialogOpen(false);
                    setPlanToCopy(null);
                }}
                planId={planToCopy?.id}
                planName={planToCopy?.name}
                onCopy={handleCopyToPatient}
            />

            {/* Dialog: Salvar como Template */}
            <Dialog open={saveTemplateDialogOpen} onOpenChange={setSaveTemplateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Salvar Plano como Modelo</DialogTitle>
                        <DialogDescription>
                            Salve este plano como um template para reutilizar em outros pacientes.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label htmlFor="template-name" className="text-sm font-medium">
                                Nome do Modelo <span className="text-destructive">*</span>
                            </label>
                            <Input
                                id="template-name"
                                placeholder="Ex: Hipertrofia 3000kcal"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                disabled={submitting}
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="template-tags" className="text-sm font-medium">
                                Tags (separadas por vírgula)
                            </label>
                            <Input
                                id="template-tags"
                                placeholder="Ex: hipertrofia, ganho de peso, 3000kcal"
                                value={templateTags}
                                onChange={(e) => setTemplateTags(e.target.value)}
                                disabled={submitting}
                            />
                            <p className="text-xs text-muted-foreground">
                                Use tags para facilitar a busca dos templates
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setSaveTemplateDialogOpen(false);
                                setTemplateName('');
                                setTemplateTags('');
                            }}
                            disabled={submitting}
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSaveAsTemplate}
                            disabled={submitting || !templateName.trim()}
                        >
                            {submitting ? 'Salvando...' : 'Salvar Modelo'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Dialog: Gerenciador de Templates */}
            <TemplateManagerDialog
                open={templateManagerOpen}
                onOpenChange={setTemplateManagerOpen}
                patientId={patientId}
                nutritionistId={nutritionistId}
                onTemplateApplied={handleTemplateApplied}
            />

            {/* Dialog de Exportação PDF */}
            <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Exportar Plano Alimentar</DialogTitle>
                        <DialogDescription>
                            Escolha o formato de exportação para PDF
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 py-4">
                        <Card
                            className="cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary"
                            onClick={() => handleExportPDF(false)}
                        >
                            <CardContent className="flex items-start gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Plano Simples</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Macronutrientes básicos (calorias, proteínas, carboidratos e gorduras)
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                            className="cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary"
                            onClick={() => handleExportPDF(true)}
                        >
                            <CardContent className="flex items-start gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                                    <Download className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Plano Completo</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Macros + micronutrientes (fibras, vitaminas, minerais)
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                    <DialogFooter className="sm:justify-start">
                        <Button variant="ghost" onClick={() => setExportDialogOpen(false)} className="w-full sm:w-auto">
                            Cancelar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* ── Modal: Escolha para Novo Plano ──────────────────────────────── */}
            <Dialog open={newPlanChoiceOpen} onOpenChange={setNewPlanChoiceOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Plus className="w-5 h-5 text-primary" />
                            Novo Plano Alimentar
                        </DialogTitle>
                        <DialogDescription>
                            Como deseja criar o novo plano?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 gap-3 py-2">
                        <Card
                            className="cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary"
                            onClick={() => {
                                setNewPlanChoiceOpen(false);
                                setPendingDraft(null);
                                setEditingPlan(null);
                                setShowForm(true);
                            }}
                        >
                            <CardContent className="flex items-start gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Plus className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Criar do zero</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Montar um novo plano personalizado, adicionando refeições e alimentos manualmente.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        <Card
                            className="cursor-pointer hover:bg-accent/50 transition-colors border-2 hover:border-primary"
                            onClick={() => {
                                setNewPlanChoiceOpen(false);
                                setTemplateManagerOpen(true);
                            }}
                        >
                            <CardContent className="flex items-start gap-3 p-4">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                                    <Copy className="h-5 w-5" />
                                </div>
                                <div className="flex-1 space-y-1">
                                    <h4 className="text-sm font-semibold leading-none">Usar protocolo</h4>
                                    <p className="text-xs text-muted-foreground">
                                        Importar um plano do banco de protocolos e adaptá-lo para este paciente.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Modal: Importar Protocolo de Dieta ────────────────────── */}
            <TemplateManagerDialog
                open={templateManagerOpen}
                onOpenChange={setTemplateManagerOpen}
                patientId={patientId}
                nutritionistId={nutritionistId}
                onTemplateApplied={(newPlan) => {
                    loadPlans();
                    if (newPlan?.id) {
                        toast({ title: 'Protocolo aplicado!', description: 'O plano foi importado e ativado para o paciente.' });
                    }
                }}
            />

        </div>
    );
};

export default MealPlanPage;
