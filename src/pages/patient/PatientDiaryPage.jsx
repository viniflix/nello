import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format, addDays, subDays, isToday, isYesterday, isTomorrow, startOfDay, isSameDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, Plus, Utensils, Trash2, MoreHorizontal, ChevronLeft, ChevronRight, FileText, Eye, Bell, Edit, Flame, Beef, Wheat, Droplet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { translateMealType } from '@/utils/mealTranslations';
import MealPlanViewDialog from '@/components/patient/MealPlanViewDialog';
import NotificationsPanel from '@/components/NotificationsPanel';
import { useNotifications } from '@/hooks/useNotifications';

/**
 * PatientDiaryPage - Aba 2: Diário
 *
 * Funcionalidades:
 * - Seletor de data para navegar entre dias
 * - Resumo de macros do dia (Calorias, P/C/G)
 * - Lista de refeições por tipo (Café da manhã, Almoço, etc.)
 * - Botão para adicionar alimentos
 * - Opção de deletar refeições
 */
export default function PatientDiaryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [meals, setMeals] = useState([]);
  const [mealPlan, setMealPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [mealToDelete, setMealToDelete] = useState(null);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { unreadCount } = useNotifications();
  const [prescriptionGoal, setPrescriptionGoal] = useState(null);

  // Todos os tipos possíveis (para modal)
  const ALL_MEAL_TYPES = [
    { key: 'breakfast', label: 'Café da Manhã' },
    { key: 'morning_snack', label: 'Lanche da Manhã' },
    { key: 'lunch', label: 'Almoço' },
    { key: 'afternoon_snack', label: 'Lanche da Tarde' },
    { key: 'dinner', label: 'Jantar' },
    { key: 'supper', label: 'Ceia' }
  ];

  // Tipos filtrados pelo plano do paciente
  const planMealTypes = mealPlan?.meal_plan_meals?.map(m => m.meal_type) || [];

  const loadMealPlan = useCallback(async () => {
    if (!user) return;

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    const { data: mealPlanData } = await supabase
      .from('meal_plans')
      .select(`
        *,
        meal_plan_meals (
          *,
          meal_plan_foods (
            *,
            foods (id, name)
          )
        )
      `)
      .eq('patient_id', user.id)
      .eq('is_active', true)
      .lte('start_date', todayStr)
      .or(`end_date.is.null,end_date.gte.${todayStr}`)
      .maybeSingle();

    setMealPlan(mealPlanData);

    // Definir metas nutricionais (prioridade: plano alimentar ativo > padrão)
    if (mealPlanData && mealPlanData.daily_calories > 0) {
      // Usar metas do plano alimentar ativo
      setPrescriptionGoal({
        calories: mealPlanData.daily_calories || 0,
        protein: mealPlanData.daily_protein || 0,
        carbs: mealPlanData.daily_carbs || 0,
        fat: mealPlanData.daily_fat || 0
      });
    } else {
      // Valores padrão para pacientes sem plano alimentar
      setPrescriptionGoal({
        calories: 2000,
        protein: 0,
        carbs: 0,
        fat: 0
      });
    }
  }, [user]);

  const loadMeals = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Buscar refeições do dia com itens e alimentos
    // Filtrar apenas refeições NÃO deletadas (deleted_at IS NULL)
    const { data: mealsData, error } = await supabase
      .from('meals')
      .select(`
        *,
        meal_items (
          *,
          foods (
            id,
            name
          )
        )
      `)
      .eq('patient_id', user.id)
      .eq('meal_date', dateStr)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erro ao carregar refeições:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as refeições.',
        variant: 'destructive'
      });
    } else {
      setMeals(mealsData || []);
    }

    setLoading(false);
  }, [user, selectedDate, toast]);

  useEffect(() => {
    loadMealPlan();
  }, [loadMealPlan]);

  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

  // Calcular totais do dia
  const dailyTotals = meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + (meal.total_calories || 0),
      protein: acc.protein + (meal.total_protein || 0),
      carbs: acc.carbs + (meal.total_carbs || 0),
      fat: acc.fat + (meal.total_fat || 0)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Agrupar refeições por tipo (apenas as do plano + outras registradas)
  const registeredMealTypes = [...new Set(meals.map(m => m.meal_type))];
  const displayMealTypes = [...new Set([...planMealTypes, ...registeredMealTypes])];

  const mealsByType = displayMealTypes.reduce((acc, type) => {
    acc[type] = meals.filter((meal) => meal.meal_type === type);
    return acc;
  }, {});

  // Navegação de datas
  const goToPreviousDay = () => {
    setSelectedDate(prev => subDays(prev, 1));
  };

  const goToNextDay = () => {
    setSelectedDate(prev => addDays(prev, 1));
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  // Formatar label da data
  const getDateLabel = (date) => {
    if (isToday(date)) {
      return 'HOJE';
    } else if (isYesterday(date)) {
      return 'ONTEM';
    } else if (isTomorrow(date)) {
      return 'AMANHÃ';
    } else {
      // Formato: "12 de Janeiro"
      return format(date, "dd 'de' MMMM", { locale: ptBR });
    }
  };

  const getDateSubtitle = (date) => {
    // Sempre mostra a data completa como subtítulo
    return format(date, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  };

  const handleDeleteMeal = async () => {
    if (!mealToDelete) return;

    // Buscar dados COMPLETOS da refeição antes de deletar (para auditoria)
    const meal = meals.find(m => m.id === mealToDelete);

    // =====================================================
    // SOFT DELETE: Marca como deletada ao invés de remover
    // =====================================================
    // IMPORTANTE: Soft delete permite auditoria completa
    // O nutricionista poderá ver o histórico completo de ações
    const { error } = await supabase
      .from('meals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', mealToDelete);

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir a refeição.',
        variant: 'destructive'
      });
    } else {
      // =====================================================
      // AUDITORIA: Registrar ação de DELETE com TODOS os detalhes
      // =====================================================
      // IMPORTANTE PARA MÓDULO FUTURO:
      // Este log será usado no Hub do Paciente para:
      // - Feed de atividades do paciente
      // - Timeline de ações no módulo "Diário do Paciente"
      // - Histórico de alterações com diff de dados (mostrar exatamente o que foi deletado)
      // - Notificações para o nutricionista
      // - Detectar tentativas de manipulação (deletar e recriar com dados diferentes)
      if (meal) {
        await supabase.rpc('log_meal_action', {
          p_patient_id: user.id,
          p_meal_id: mealToDelete,
          p_action: 'delete',
          p_meal_type: meal.meal_type,
          p_meal_date: meal.meal_date,
          p_meal_time: meal.meal_time,
          p_details: {
            total_calories: meal.total_calories,
            total_protein: meal.total_protein,
            total_carbs: meal.total_carbs,
            total_fat: meal.total_fat,
            // Salvar TODOS os alimentos que foram deletados
            items: (meal.meal_items || []).map(item => ({
              food_id: item.food_id,
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              calories: item.calories,
              protein: item.protein,
              carbs: item.carbs,
              fat: item.fat
            })),
            deleted_at: new Date().toISOString()
          }
        });
      }

      toast({
        title: 'Sucesso',
        description: 'Refeição excluída com sucesso.'
      });
      loadMeals();
    }
    setMealToDelete(null);
  };

  const handleAddMeal = (mealType) => {
    // Buscar dados da refeição do plano (se existir)
    const planMeal = mealPlan?.meal_plan_meals?.find(m => m.meal_type === mealType);

    navigate('/patient/add-meal', {
      state: {
        mealType,
        mealTime: planMeal?.meal_time || format(new Date(), 'HH:mm'),
        mealName: planMeal?.name || '',
        recommendedFoods: planMeal?.meal_plan_foods || []
      }
    });
    setModalOpen(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="mb-2 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Plano Alimentar</h1>
            <p className="text-muted-foreground mt-1">
              Registre suas refeições do dia
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* My Plan Button - Secondary, Non-intrusive */}
            {mealPlan && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPlanDialogOpen(true)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Eye className="w-4 h-4 mr-2" />
                <span className="hidden sm:inline">Ver Plano</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNotifications(true)}
              className="relative"
            >
              <Bell className="w-6 h-6 text-gray-700" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </Button>
          </div>
        </div>

        {/* Date Navigation - Cleaner Design */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 pb-4">
              <div className="flex items-center justify-between gap-4">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToPreviousDay}
                  className="flex-shrink-0"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>

                <div className="flex-1 text-center">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="hover:opacity-80 transition-opacity">
                        <h2 className="text-2xl font-bold text-primary">
                          {getDateLabel(selectedDate)}
                        </h2>
                        <p className="text-sm text-muted-foreground capitalize mt-1">
                          {getDateSubtitle(selectedDate)}
                        </p>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="center">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={(date) => date && setSelectedDate(date)}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToNextDay}
                  className="flex-shrink-0"
                  disabled={isSameDay(selectedDate, new Date())}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>

              {!isToday(selectedDate) && (
                <div className="mt-4 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={goToToday}
                    className="text-primary hover:text-primary/80"
                  >
                    Ir para Hoje
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Daily Summary with Progress Bars */}
        {prescriptionGoal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-[#5f6f52]/20 shadow-sm">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg text-[#5f6f52]">Progresso do Dia</CardTitle>
                <CardDescription>Consumido vs Meta</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Calories */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-foreground">Calorias</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {Math.round(dailyTotals.calories)} / {Math.round(prescriptionGoal.calories)} kcal
                    </span>
                  </div>
                  <Progress
                    value={prescriptionGoal.calories > 0 ? Math.min((dailyTotals.calories / prescriptionGoal.calories) * 100, 100) : 0}
                    className="h-3"
                    indicatorClassName="bg-gradient-to-r from-orange-500 to-red-500"
                  />
                </div>

                {/* Protein */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Beef className="w-4 h-4 text-sky-500" />
                      <span className="text-sm font-medium text-foreground">Proteínas</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {Math.round(dailyTotals.protein)} / {Math.round(prescriptionGoal.protein)}g
                    </span>
                  </div>
                  <Progress
                    value={prescriptionGoal.protein > 0 ? Math.min((dailyTotals.protein / prescriptionGoal.protein) * 100, 100) : 0}
                    className="h-3"
                    indicatorClassName="bg-sky-500"
                  />
                </div>

                {/* Carbs */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wheat className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium text-foreground">Carboidratos</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {Math.round(dailyTotals.carbs)} / {Math.round(prescriptionGoal.carbs)}g
                    </span>
                  </div>
                  <Progress
                    value={prescriptionGoal.carbs > 0 ? Math.min((dailyTotals.carbs / prescriptionGoal.carbs) * 100, 100) : 0}
                    className="h-3"
                    indicatorClassName="bg-amber-500"
                  />
                </div>

                {/* Fat */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Droplet className="w-4 h-4 text-yellow-500" />
                      <span className="text-sm font-medium text-foreground">Gorduras</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {Math.round(dailyTotals.fat)} / {Math.round(prescriptionGoal.fat)}g
                    </span>
                  </div>
                  <Progress
                    value={prescriptionGoal.fat > 0 ? Math.min((dailyTotals.fat / prescriptionGoal.fat) * 100, 100) : 0}
                    className="h-3"
                    indicatorClassName="bg-yellow-500"
                  />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Meal Cards - Ghost Cards for Empty, Clean Cards for Filled */}
        <div className="space-y-4">
          {displayMealTypes.map((mealType, index) => {
            const mealsOfType = mealsByType[mealType] || [];
            const hasMeals = mealsOfType.length > 0;

            return (
              <motion.div
                key={mealType}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.05 }}
              >
                {!hasMeals ? (
                  // Ghost Card - Empty State (Acts as Button)
                  <Card
                    className="border-2 border-dashed border-muted-foreground/30 bg-muted/20 hover:bg-muted/30 hover:border-primary/40 transition-all cursor-pointer"
                    onClick={() => handleAddMeal(mealType)}
                  >
                    <CardContent className="py-8 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="p-3 rounded-full bg-primary/10">
                          <Utensils className="w-6 h-6 text-primary/60" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-muted-foreground">
                            Registrar {translateMealType(mealType)}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Clique para adicionar alimentos
                          </p>
                        </div>
                        <Button
                          size="sm"
                          className="mt-2 bg-primary hover:bg-primary/90"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddMeal(mealType);
                          }}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Adicionar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  // Filled Card - Registered Meals
                  <Card className="shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Utensils className="w-5 h-5 text-[#5f6f52]" />
                          <CardTitle className="text-base">{translateMealType(mealType)}</CardTitle>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddMeal(mealType)}
                          className="border-[#5f6f52]/30 text-[#5f6f52] hover:bg-[#5f6f52]/10"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Adicionar mais
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {mealsOfType.map((meal) => (
                          <motion.div
                            key={meal.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="border rounded-lg p-4 bg-background hover:bg-muted/30 transition-colors"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="text-sm font-semibold text-foreground">
                                    {translateMealType(mealType)}
                                  </h4>
                                </div>
                                <p className="text-lg font-bold text-[#5f6f52]">
                                  {meal.total_calories?.toFixed(0)} kcal
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  P: {meal.total_protein?.toFixed(1)}g • C: {meal.total_carbs?.toFixed(1)}g • G: {meal.total_fat?.toFixed(1)}g
                                </p>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => navigate('/patient/add-meal', {
                                      state: {
                                        editMode: true,
                                        mealId: meal.id
                                      }
                                    })}
                                  >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => setMealToDelete(meal.id)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    Excluir
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            {/* Lista de alimentos */}
                            {meal.meal_items?.length > 0 && (
                              <div className="space-y-2 mt-3 pt-3 border-t">
                                {meal.meal_items.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className="flex justify-between items-center text-sm"
                                  >
                                    <span className="text-foreground">
                                      {item.foods?.name || 'Alimento desconhecido'}
                                    </span>
                                    <span className="font-medium text-muted-foreground">
                                      {item.quantity} {item.measure}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Botão: Registrar Outra Refeição */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <MoreHorizontal className="w-4 h-4 mr-2" />
              Registrar Outra Refeição
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Escolha o Tipo de Refeição</DialogTitle>
              <DialogDescription>
                Selecione qual refeição deseja registrar
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-2 py-4">
              {ALL_MEAL_TYPES.map((mealType) => (
                <Button
                  key={mealType.key}
                  variant="outline"
                  className="justify-start"
                  onClick={() => handleAddMeal(mealType.key)}
                >
                  <Utensils className="w-4 h-4 mr-2" />
                  {mealType.label}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

      </div>

      {/* Dialog: Ver Plano Alimentar Completo */}
      <MealPlanViewDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        mealPlan={mealPlan}
        patientName={user?.profile?.name}
      />

      {/* Painel de Notificações */}
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />

      {/* AlertDialog de Confirmação de Exclusão */}
      <AlertDialog open={!!mealToDelete} onOpenChange={() => setMealToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Refeição</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente excluir esta refeição? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMeal} className="bg-destructive hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}
    </div>
  );
}