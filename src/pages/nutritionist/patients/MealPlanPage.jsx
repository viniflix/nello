import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Copy, Archive, RefreshCw, Edit, BarChart3, Download, FileText, MoreVertical, Utensils, Save, FolderOpen, ShoppingCart, AlertCircle } from 'lucide-react';
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
    savePlanAsTemplate
} from '@/lib/supabase/meal-plan-queries';
import { supabase } from '@/lib/customSupabaseClient';
import { exportMealPlanToPdf } from '@/lib/pdfUtils';
import { generateShoppingList } from '@/lib/pdf/shoppingListGenerator';
import { translateMealType } from '@/utils/mealTranslations';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';
import { useAuth } from '@/contexts/AuthContext';
import { getLatestEnergyCalculation } from '@/lib/supabase/energy-queries';
import PlanTargetMonitor from '@/components/meal-plan/PlanTargetMonitor';
import { getPatientModuleSyncFlags, clearPatientModuleSyncFlags } from '@/lib/supabase/anthropometry-queries';

const MealPlanPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { user } = useAuth();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [plans, setPlans] = useState([]);
    const [activePlan, setActivePlan] = useState(null);
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

    // Carregar planos
    const loadPlans = useCallback(async () => {
        if (!patientId) return;

        setLoading(true);
        try {
            const [plansResult, activeResult] = await Promise.all([
                getMealPlans(patientId),
                getActiveMealPlan(patientId)
            ]);

            if (plansResult.error) throw plansResult.error;

            setPlans(plansResult.data || []);
            setActivePlan(activeResult.data);
        } catch (error) {
            console.error('Erro ao carregar planos:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível carregar os planos alimentares',
                variant: 'destructive'
            });
        } finally {
            setLoading(false);
        }
    }, [patientId, toast]);

    useEffect(() => {
        loadPlans();
    }, [loadPlans]);

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

    // Criar ou atualizar plano
    const handleSubmit = async (planData, planId = null) => {
        setSubmitting(true);

        try {
            if (planId) {
                // Atualizar plano existente
                const result = await updateFullMealPlan(planId, planData);
                if (result.error) throw result.error;
            } else {
                // Criar novo plano
                const result = await createMealPlan({
                    patient_id: planData.patient_id,
                    nutritionist_id: planData.nutritionist_id,
                    name: planData.name,
                    description: planData.description,
                    active_days: planData.active_days,
                    start_date: planData.start_date,
                    end_date: planData.end_date || null
                });

                if (result.error) throw result.error;

                // Adicionar refeições e alimentos
                for (const meal of planData.meals) {
                    const mealResult = await addMealToPlan({
                        meal_plan_id: result.data.id,
                        name: meal.name,
                        meal_type: meal.meal_type,
                        meal_time: meal.meal_time,
                        notes: meal.notes,
                        order_index: meal.order_index
                    });

                    if (mealResult.error) throw mealResult.error;

                    // Adicionar alimentos à refeição
                    for (const food of meal.foods || []) {
                        const foodResult = await addFoodToMeal({
                            meal_plan_meal_id: mealResult.data.id,
                            food_id: food.food_id,
                            quantity: food.quantity,
                            unit: food.unit,
                            calories: food.calories,
                            protein: food.protein,
                            carbs: food.carbs,
                            fat: food.fat,
                            notes: food.notes,
                            order_index: food.order_index || 0
                        });

                        if (foodResult?.error) throw foodResult.error;
                    }
                }
            }

            toast({
                title: 'Sucesso',
                description: planId
                    ? 'Plano atualizado com sucesso'
                    : 'Plano criado com sucesso',
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
            await loadPlans();
        } catch (error) {
            console.error('Erro ao salvar plano:', error);
            toast({
                title: 'Erro',
                description: 'Não foi possível salvar o plano alimentar',
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
        await loadPlans();
        if (newPlan) {
            setActivePlan(newPlan);
        }
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
            <div className="container mx-auto px-4 py-8">
                <div className="text-center">Carregando...</div>
            </div>
        );
    }

    if (showForm) {
        return (
            <div className="container mx-auto px-4 py-8 max-w-6xl">
                <div className="mb-6">
                    <Button
                        variant="ghost"
                        onClick={() => {
                            setShowForm(false);
                            setEditingPlan(null);
                        }}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                </div>

                <MealPlanForm
                    patientId={patientId}
                    nutritionistId={nutritionistId}
                    initialData={editingPlan}
                    onSubmit={handleSubmit}
                    onCancel={() => {
                        setShowForm(false);
                        setEditingPlan(null);
                    }}
                    loading={submitting}
                />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-6 sm:py-8 max-w-6xl">
            {/* Header */}
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/nutritionist/patients/${patientId}/hub`)}
                        className="-ml-2 text-[#5f6f52] hover:text-[#5f6f52] hover:bg-[#5f6f52]/10"
                    >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Voltar
                    </Button>
                    <Button variant="outline" size="sm" onClick={loadPlans} className="flex-shrink-0">
                        <RefreshCw className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Atualizar</span>
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
                    <Button size="sm" onClick={() => setShowForm(true)} className="w-full sm:w-auto">
                        <Plus className="h-4 w-4 mr-2" />
                        Novo Plano
                    </Button>
                </div>
            </div>

            {syncFlags?.needs_meal_plan_review && (
                <Alert className="mb-6 border-amber-200 bg-amber-50">
                    <AlertCircle className="h-4 w-4 text-amber-700" />
                    <AlertDescription className="text-amber-800">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p>A antropometria foi atualizada recentemente. Revise o plano alimentar e salve para sincronizar.</p>
                                {syncFlags?.anthropometry_updated_at && (
                                    <p className="mt-1 text-xs text-amber-700/90">
                                        {formatSyncUpdateTime(syncFlags.anthropometry_updated_at)}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100"
                                    onClick={() => {
                                        if (activePlan?.id) {
                                            handleEdit(activePlan.id);
                                        } else {
                                            setShowForm(true);
                                        }
                                    }}
                                >
                                    Revisar agora
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-amber-900 hover:bg-amber-100"
                                    onClick={handleMarkMealPlanAsReviewed}
                                >
                                    Marcar como revisado
                                </Button>
                            </div>
                        </div>
                    </AlertDescription>
                </Alert>
            )}

            {/* Target Monitor */}
            <PlanTargetMonitor
                targetCalories={energyCalculation?.get_with_activities || energyCalculation?.get || null}
                currentCalories={activePlan?.daily_calories || 0}
                patientId={patientId}
                energyCalculation={energyCalculation}
            />

            {/* Plano Ativo */}
            {activePlan && (
                <Card className="mb-6 border-primary shadow-sm">
                    <CardHeader>
                        <div className="flex flex-col gap-4">
                            {/* Título e Badge */}
                            <div className="flex items-center justify-between gap-3">
                                <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                                    <span className="break-words">{activePlan.name}</span>
                                    <Badge className="bg-primary">Ativo</Badge>
                                </CardTitle>

                                {/* Botões de Ação */}
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEdit(activePlan.id)}
                                        className="hidden sm:flex"
                                    >
                                        <Edit className="h-4 w-4 mr-2" />
                                        Editar
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan/${activePlan.id}/summary`)}
                                        className="hidden sm:flex"
                                    >
                                        <BarChart3 className="h-4 w-4 mr-2" />
                                        Resumo Nutricional
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleGenerateShoppingList}
                                        className="hidden sm:flex"
                                    >
                                        <ShoppingCart className="h-4 w-4 mr-2" />
                                        Lista de Compras
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
                                                <DropdownMenuItem onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan/${activePlan.id}/summary`)}>
                                                    <BarChart3 className="h-4 w-4 mr-2" />
                                                    Ver Resumo Nutricional
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                            </div>

                                            {/* Ações secundárias (sempre visíveis) */}
                                            <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                                                <Download className="h-4 w-4 mr-2" />
                                                Exportar PDF
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={handleGenerateShoppingList}>
                                                <ShoppingCart className="h-4 w-4 mr-2" />
                                                Gerar Lista de Compras
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => handleCopy(activePlan.id)}>
                                                <Copy className="h-4 w-4 mr-2" />
                                                Copiar como Modelo
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

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div>
                                <div className="text-sm text-muted-foreground">Início</div>
                                <div className="font-semibold">{formatDate(activePlan.start_date)}</div>
                            </div>
                            <div>
                                <div className="text-sm text-muted-foreground">Término</div>
                                <div className="font-semibold">
                                    {activePlan.end_date ? formatDate(activePlan.end_date) : 'Indeterminado'}
                                </div>
                            </div>
                            <div>
                                <div className="text-sm text-muted-foreground">Dias Ativos</div>
                                <div className="font-semibold">{getDaysLabel(activePlan.active_days)}</div>
                            </div>
                            <div>
                                <div className="text-sm text-muted-foreground">Refeições</div>
                                <div className="font-semibold">{activePlan.meals?.length || 0}</div>
                            </div>
                        </div>

                        {/* Grid: Refeições (60%) + Macronutrientes (40%) */}
                        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
                            {/* Refeições - 60% */}
                            <div className="lg:col-span-6">
                                {activePlan.meals && activePlan.meals.length > 0 ? (
                                    <div className="space-y-2">
                                        <div className="font-semibold mb-3">Refeições:</div>
                                        {activePlan.meals.map((meal, index) => (
                                            <div key={meal.id} className="p-3 border rounded-lg bg-muted/30">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <div className="font-medium">
                                                            {index + 1}. {meal.name}
                                                            {meal.meal_time && (
                                                                <span className="text-sm text-muted-foreground ml-2">
                                                                    às {meal.meal_time}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {meal.foods?.length || 0} alimento(s) •
                                                            {' '}{meal.total_calories?.toFixed(0) || 0} kcal
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Alert>
                                        <AlertDescription>
                                            Nenhuma refeição adicionada ainda.
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>

                            {/* Macronutrientes - 40% (somente visualização) */}
                            <div className="lg:col-span-4">
                                <MacrosChart
                                    protein={activePlan.daily_protein || 0}
                                    carbs={activePlan.daily_carbs || 0}
                                    fat={activePlan.daily_fat || 0}
                                    calories={activePlan.daily_calories || 0}
                                    patientId={patientId}
                                    planId={null}
                                    referenceValues={referenceValues}
                                    onReferenceUpdate={null}
                                    readOnly={true}
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {activePlan && (
                <Card className="mb-6">
                    <CardHeader>
                        <CardTitle className="text-lg">Histórico de Versões do Plano</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {versionsLoading ? (
                            <p className="text-sm text-muted-foreground">Carregando versões...</p>
                        ) : mealPlanVersions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nenhuma versão registrada ainda. Ao salvar edições, o histórico será criado automaticamente.
                            </p>
                        ) : (
                            <>
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
                            </>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Lista de Planos */}
            <Card>
                <CardHeader>
                    <CardTitle>Todos os Planos</CardTitle>
                </CardHeader>
                <CardContent>
                    {plans.length === 0 ? (
                        <Alert>
                            <AlertDescription>
                                Nenhum plano alimentar criado ainda. Clique em "Novo Plano" para começar.
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <div className="space-y-3">
                            {plans.map((plan) => (
                                <div
                                    key={plan.id}
                                    className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-semibold">{plan.name}</h3>
                                                {plan.is_active && <Badge variant="outline">Ativo</Badge>}
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
                                            {/* Botão Ativar - só aparece se plano está inativo */}
                                            {!plan.is_active && (
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    onClick={() => handleSetActive(plan.id)}
                                                    title="Ativar este plano"
                                                >
                                                    <RefreshCw className="h-4 w-4" />
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEdit(plan.id)}
                                                title="Editar plano"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleCopy(plan.id)}
                                                title="Copiar modelo"
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    setPlanToDelete(plan.id);
                                                    setDeleteDialogOpen(true);
                                                }}
                                                title="Deletar plano"
                                            >
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

        </div>
    );
};

export default MealPlanPage;
