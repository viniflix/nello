import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Copy, Archive, RefreshCw, Edit, BarChart3, Download, FileText, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
    getMealPlans,
    getActiveMealPlan,
    getMealPlanById,
    getReferenceValues,
    createMealPlan,
    updateFullMealPlan,
    deleteMealPlan,
    archiveMealPlan,
    setActiveMealPlan,
    copyMealPlan,
    copyMealPlanToPatient,
    addMealToPlan,
    addFoodToMeal
} from '@/lib/supabase/meal-plan-queries';
import { supabase } from '@/lib/customSupabaseClient';
import { exportMealPlanToPdf } from '@/lib/pdfUtils';
import { translateMealType } from '@/utils/mealTranslations';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';
import { useAuth } from '@/contexts/AuthContext';

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
                        await addFoodToMeal({
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
        <div className="container mx-auto px-4 py-8 max-w-6xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/nutritionist/patients/${patientId}/hub`)}>
                        <ArrowLeft className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Voltar</span>
                    </Button>
                    <div className="min-w-0">
                        <h1 className="text-xl sm:text-3xl font-bold truncate">Planos Alimentares</h1>
                        <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                            Gerencie os planos alimentares do paciente
                        </p>
                    </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    <Button variant="outline" size="icon" onClick={loadPlans}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={() => setShowForm(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        <span className="hidden sm:inline">Novo Plano</span>
                        <span className="sm:hidden">Novo</span>
                    </Button>
                </div>
            </div>

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
