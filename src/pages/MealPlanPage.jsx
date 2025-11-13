import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Copy, Archive, RefreshCw, Edit, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import MealPlanForm from '@/components/meal-plan/MealPlanForm';
import CopyModelDialog from '@/components/meal-plan/CopyModelDialog';
import {
    getMealPlans,
    getActiveMealPlan,
    getMealPlanById,
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

const MealPlanPage = () => {
    const { patientId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [plans, setPlans] = useState([]);
    const [activePlan, setActivePlan] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editingPlan, setEditingPlan] = useState(null);
    const [nutritionistId, setNutritionistId] = useState(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [planToDelete, setPlanToDelete] = useState(null);
    const [copyModelDialogOpen, setCopyModelDialogOpen] = useState(false);
    const [planToCopy, setPlanToCopy] = useState(null);

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
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" onClick={() => navigate(-1)}>
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Voltar
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold">Planos Alimentares</h1>
                        <p className="text-muted-foreground">
                            Gerencie os planos alimentares do paciente
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={loadPlans}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => setShowForm(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Novo Plano
                    </Button>
                </div>
            </div>

            {/* Plano Ativo */}
            {activePlan && (
                <Card className="mb-6 border-primary">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-xl flex items-center gap-2">
                                {activePlan.name}
                                <Badge>Plano Ativo</Badge>
                            </CardTitle>
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    onClick={() => navigate(`/nutritionist/patients/${patientId}/meal-plan/${activePlan.id}/summary`)}
                                >
                                    <BarChart3 className="h-4 w-4 mr-2" />
                                    Ver Resumo Nutricional
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleEdit(activePlan.id)}
                                >
                                    <Edit className="h-4 w-4 mr-2" />
                                    Editar
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopy(activePlan.id)}
                                >
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copiar Modelo
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleArchive(activePlan.id)}
                                >
                                    <Archive className="h-4 w-4 mr-2" />
                                    Arquivar
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {activePlan.description && (
                            <p className="text-muted-foreground mb-4">{activePlan.description}</p>
                        )}

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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

                        {/* Totais Nutricionais */}
                        <div className="p-4 bg-primary/5 rounded-lg">
                            <div className="font-semibold mb-2">Totais Diários:</div>
                            <div className="grid grid-cols-4 gap-4 text-sm">
                                <div>
                                    <div className="text-muted-foreground">Calorias</div>
                                    <div className="font-bold text-xl">{activePlan.daily_calories?.toFixed(0) || 0}</div>
                                    <div className="text-xs text-muted-foreground">kcal</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Proteínas</div>
                                    <div className="font-bold text-xl">{activePlan.daily_protein?.toFixed(1) || 0}</div>
                                    <div className="text-xs text-muted-foreground">g</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Carboidratos</div>
                                    <div className="font-bold text-xl">{activePlan.daily_carbs?.toFixed(1) || 0}</div>
                                    <div className="text-xs text-muted-foreground">g</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Gorduras</div>
                                    <div className="font-bold text-xl">{activePlan.daily_fat?.toFixed(1) || 0}</div>
                                    <div className="text-xs text-muted-foreground">g</div>
                                </div>
                            </div>
                        </div>

                        {/* Refeições do Plano Ativo */}
                        {activePlan.meals && activePlan.meals.length > 0 && (
                            <div className="mt-4 space-y-2">
                                <div className="font-semibold">Refeições:</div>
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
        </div>
    );
};

export default MealPlanPage;
