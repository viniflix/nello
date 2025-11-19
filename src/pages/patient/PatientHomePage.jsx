import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BookMarked, UtensilsCrossed, CalendarClock, Bell } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import NextMealCard from '@/components/patient/NextMealCard';
import PatientMetricsWidget from '@/components/patient/PatientMetricsWidget';
import DailyAdherenceCard from '@/components/patient/DailyAdherenceCard';
import RecentAchievementsWidget from '@/components/patient/RecentAchievementsWidget';
import NotificationsPanel from '@/components/NotificationsPanel';
import { useNotifications } from '@/hooks/useNotifications';

/**
 * PatientHomePage - Aba 1: Início
 */
export default function PatientHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prescription, setPrescription] = useState(null);
  const [nextAppointment, setNextAppointment] = useState(null);
  const [todayMealsCount, setTodayMealsCount] = useState(0);
  const [registeredMeals, setRegisteredMeals] = useState([]);
  const [prescriptionGoal, setPrescriptionGoal] = useState(null); // Metas de macros
  const [currentProgress, setCurrentProgress] = useState(null); // Progresso atual
  const [loading, setLoading] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const { unreadCount } = useNotifications();

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    // 1. Buscar plano alimentar ativo do paciente
    const { data: mealPlanData, error: mealPlanError } = await supabase
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

    setPrescription(mealPlanData);

    // 2. Buscar próxima consulta
    const { data: apptData } = await supabase
      .from('appointments')
      .select('*')
      .eq('patient_id', user.id)
      .gte('appointment_time', today.toISOString())
      .order('appointment_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    setNextAppointment(apptData);

    // 3. Buscar refeições registradas hoje (não deletadas)
    const { data: mealsData, count } = await supabase
      .from('meals')
      .select('*', { count: 'exact' })
      .eq('patient_id', user.id)
      .eq('meal_date', todayStr)
      .is('deleted_at', null);

    setTodayMealsCount(count || 0);
    setRegisteredMeals(mealsData || []);

    // 4. Buscar prescrição nutricional (metas de macros do dia)
    const { data: prescriptionData } = await supabase
      .from('prescriptions')
      .select('calories, protein, carbs, fat, start_date, end_date')
      .eq('patient_id', user.id)
      .lte('start_date', todayStr)
      .or(`end_date.is.null,end_date.gte.${todayStr}`)
      .maybeSingle();

    if (prescriptionData) {
      setPrescriptionGoal({
        calories: prescriptionData.calories || 0,
        protein: prescriptionData.protein || 0,
        carbs: prescriptionData.carbs || 0,
        fat: prescriptionData.fat || 0
      });
    }

    // 5. Calcular progresso atual (somar refeições de hoje)
    if (mealsData && mealsData.length > 0) {
      const progress = mealsData.reduce((acc, meal) => ({
        calories: acc.calories + (meal.total_calories || 0),
        protein: acc.protein + (meal.total_protein || 0),
        carbs: acc.carbs + (meal.total_carbs || 0),
        fat: acc.fat + (meal.total_fat || 0)
      }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

      setCurrentProgress(progress);
    } else {
      // Se não há refeições, progresso é zero
      setCurrentProgress({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const firstName = user?.profile?.name?.split(' ')[0] || 'Paciente';

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto w-full px-4 md:px-8 py-8"
      >
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold font-heading uppercase tracking-wide text-primary">
              Olá, {firstName}! 👋
            </h2>
            <p className="text-neutral-600 mt-1">
              {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowNotifications(true)}
            className="relative -mt-1"
          >
            <Bell className="w-6 h-6 text-gray-700" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </Button>
        </div>

        {/* Lembrete de Consulta - SEMPRE PRIMEIRO (TOPO) */}
        {nextAppointment && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <Card className="bg-blue-50 border-blue-200 shadow-card">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-blue-600" />
                  <CardTitle className="text-lg text-blue-900">
                    Próxima Consulta
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-blue-900">
                  {format(
                    new Date(nextAppointment.appointment_time),
                    "dd 'de' MMMM 'às' HH:mm",
                    { locale: ptBR }
                  )}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Card de Progresso Diário */}
            {prescriptionGoal && currentProgress && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <DailyAdherenceCard
                  goal={prescriptionGoal}
                  current={currentProgress}
                />
              </motion.div>
            )}

            {/* 2. Card: Próxima Refeição */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="shadow-card-dark rounded-xl bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed className="w-5 h-5 text-primary" />
                      <CardTitle className="text-lg font-semibold">Próxima Refeição</CardTitle>
                    </div>
                  </div>
                  <CardDescription>
                    Veja o que está planejado para sua próxima refeição
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {prescription?.meal_plan_meals && prescription.meal_plan_meals.length > 0 ? (
                    <NextMealCard
                      mealPlanMeals={prescription.meal_plan_meals}
                      registeredMeals={registeredMeals}
                    />
                  ) : (
                    <div className="text-center py-8">
                      <UtensilsCrossed className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Nenhum plano alimentar ativo no momento.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Entre em contato com seu nutricionista.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* 2.5. Widget de Conquistas (Mobile e Desktop) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="lg:hidden"
            >
              <RecentAchievementsWidget />
            </motion.div>

            {/* 3. Card: Diário Alimentar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card
                className="shadow-card-dark rounded-xl bg-card cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => navigate('/patient/diario')}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookMarked className="w-5 h-5 text-primary" />
                      <CardTitle className="text-base font-semibold">Diário Alimentar</CardTitle>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      todayMealsCount > 0
                        ? 'bg-primary/10 text-primary'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {todayMealsCount > 0
                        ? `${todayMealsCount} ${todayMealsCount === 1 ? 'refeição' : 'refeições'}`
                        : 'Vazio'}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    {todayMealsCount > 0
                      ? 'Continue registrando suas refeições'
                      : 'Comece registrando sua primeira refeição hoje'}
                  </p>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/patient/diario');
                    }}
                  >
                    <BookMarked className="w-4 h-4 mr-2" />
                    {todayMealsCount > 0 ? 'Ver diário' : 'Registrar agora'}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* 4. Meus Indicadores (Mobile) - Aparece só no mobile */}
            <div className="lg:hidden">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <PatientMetricsWidget />
              </motion.div>
            </div>
          </div>

          {/* Coluna Lateral (Desktop) */}
          <div className="hidden lg:block lg:col-span-1 space-y-6">
            {/* Widget de Métricas */}
            <PatientMetricsWidget />

            {/* Widget de Conquistas */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <RecentAchievementsWidget />
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Painel de Notificações */}
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
    </div>
  );
}
