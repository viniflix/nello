import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BookMarked, UtensilsCrossed, CalendarClock, Bell, Clock, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import NextMealCard from '@/components/patient/NextMealCard';
import PatientMetricsWidget from '@/components/patient/PatientMetricsWidget';
import DailyAdherenceCard from '@/components/patient/DailyAdherenceCard';
import RecentAchievementsWidget from '@/components/patient/RecentAchievementsWidget';
import NotificationsPanel from '@/components/NotificationsPanel';
import PatientPendingCheckinsWidget from '@/components/patient/PatientPendingCheckinsWidget';
import { useNotifications } from '@/hooks/useNotifications';
import { usePatientHomeData } from './usePatientHomeData';

/**
 * PatientHomePage - Aba 1: Início
 */
export default function PatientHomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const { unreadCount } = useNotifications();
  const { prescription, nextAppointment, todayMealsCount, registeredMeals, prescriptionGoal,
    currentProgress, prescriptionReady, mealsReady, linkStatus, loading, fetching, error, hasSnapshot, loadData } = usePatientHomeData(user);

  if (loading) {
    return (
      <div role="status" aria-label="Carregando início" className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!hasSnapshot && error) return <section role="alert" className="patient-page-content space-y-3">
    <h1 className="patient-page-title">Não foi possível carregar o início</h1><p>{error.message}</p>
    {error.retryable && <Button onClick={() => loadData()}>Tentar novamente</Button>}
    {!error.retryable && <Button variant="outline" onClick={() => navigate('/patient/perfil')}>Voltar ao perfil</Button>}
  </section>;

  const firstName = user?.profile?.name?.split(' ')[0] || 'Paciente';

  return (
    <div className="flex flex-col min-h-dvh bg-background">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="patient-page-content"
      >
        {error && <div role="alert" className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-xl rounded-xl border bg-background p-3 text-sm shadow-sm">
          <p>{error.message} A última consulta foi preservada; a atualização não foi confirmada.</p>
          {error.retryable && <Button variant="outline" className="mt-2" onClick={() => loadData()}>Tentar novamente</Button>}
        </div>}
        {/* Estado Pendente */}
        {linkStatus === 'pending' && (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-12 px-6 bg-amber-50 rounded-2xl border-2 border-dashed border-amber-200 text-center"
            >
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6">
                    <Clock className="w-10 h-10 text-amber-600 animate-pulse" />
                </div>
                <h2 className="text-2xl font-bold text-amber-900 mb-2">Vínculo em Análise</h2>
                <p className="text-amber-800/80 max-w-md mx-auto mb-8">
                    Sua solicitação enviada para o nutricionista está aguardando aprovação.
                    Assim que ele aceitar, seu plano alimentar e diário serão liberados automaticamente.
                </p>
                <Button
                    variant="outline"
                    className="border-amber-300 text-amber-700 hover:bg-amber-100"
                    onClick={() => loadData()}
                    disabled={fetching}
                >
                    <Clock className="w-4 h-4 mr-2" /> Verificar novamente
                </Button>
            </motion.div>
        )}

        {(linkStatus === 'ended' || linkStatus === 'unlinked') && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border bg-card p-6 text-center shadow-sm"
          >
            <Info className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold">Sem acompanhamento ativo</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              {linkStatus === 'ended'
                ? 'Seu acompanhamento anterior foi encerrado. Seu histórico continua disponível para você, e um novo vínculo poderá ser criado por convite.'
                : 'Use o código de convite de um nutricionista para iniciar um acompanhamento.'}
            </p>
            <Button className="mt-5" onClick={() => navigate('/patient/invites')}>
              Vincular a um nutricionista
            </Button>
          </motion.div>
        )}

        {linkStatus === 'active' && (
            <>
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h2 className="patient-page-title">
              Olá, {firstName}! 👋
            </h2>
            <p className="text-neutral-600 mt-1">
              {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir notificações"
            onClick={() => setShowNotifications(true)}
            className="relative -mt-1"
          >
            <Bell className="h-6 w-6 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </Button>
        </div>

        {/* Banner Arquivado */}
        {user?.profile?.is_active === false && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 flex items-start gap-4 shadow-sm">
                <div className="bg-destructive/20 p-2 rounded-full mt-0.5 shrink-0">
                    <Info className="w-5 h-5 text-destructive" />
                </div>
                <div>
                    <h3 className="font-semibold text-destructive text-base">Acompanhamento Encerrado</h3>
                    <p className="text-sm text-destructive/90 mt-1">
                        Seu vínculo com este nutricionista foi arquivado. Você ainda pode visualizar seu diário, planos antigos e evolução, mas novas interações (como mensagens) estão bloqueadas.
                    </p>
                    <p className="text-sm text-destructive mt-2 font-medium">
                        Seu perfil está livre para aceitar um novo convite.
                    </p>
                </div>
            </div>
          </motion.div>
        )}

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
                    new Date(nextAppointment.start_time || nextAppointment.appointment_time),
                    "dd 'de' MMMM 'às' HH:mm",
                    { locale: ptBR }
                  )}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* 0. Widget de Check-ins Pendentes (TOP PRIORITY ABOVE MEALS) */}
        <PatientPendingCheckinsWidget />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Card: Registrar Alimentação (TOP PRIORITY) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Card
                className="shadow-card-dark rounded-xl bg-card cursor-pointer hover:shadow-lg transition-shadow border-2 border-primary/20"

              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UtensilsCrossed className="w-5 h-5 text-primary" />
                      <CardTitle className="text-lg font-semibold">Registrar Alimentação</CardTitle>
                    </div>
                  </div>
                  <CardDescription>
                    Registre suas refeições do dia
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    Adicione alimentos e quantidades para suas refeições
                  </p>
                  <Button
                    size="sm"
                    className="w-full bg-primary hover:bg-primary/90"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate('/patient/diario');
                    }}
                  >
                    <UtensilsCrossed className="w-4 h-4 mr-2" />
                    Registrar Refeição
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* 2. Card: Plano Alimentar (SECOND) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="shadow-card-dark rounded-xl bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BookMarked className="w-5 h-5 text-primary" />
                      <CardTitle className="text-lg font-semibold">Plano Alimentar</CardTitle>
                    </div>
                  </div>
                  <CardDescription>
                    Veja o que está planejado para suas refeições
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {prescriptionReady === false ? <p role="status">Carregando plano alimentar…</p> : prescription?.meal_plan_meals && prescription.meal_plan_meals.length > 0 ? (
                    <NextMealCard
                      mealPlanMeals={prescription.meal_plan_meals}
                      registeredMeals={registeredMeals || []}
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

            {/* 3. Card de Progresso Diário (THIRD) */}
            {prescriptionGoal && currentProgress && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <DailyAdherenceCard
                  goal={prescriptionGoal}
                  current={currentProgress}
                />
              </motion.div>
            )}

            {/* 2.5. Widget de Conquistas (Mobile e Desktop) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="lg:hidden"
            >
              <RecentAchievementsWidget />
            </motion.div>

            {/* 4. Card: Diário Alimentar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Card
                className="shadow-card-dark rounded-xl bg-card cursor-pointer hover:shadow-lg transition-shadow"

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
                      {mealsReady === false ? 'Carregando…' : todayMealsCount > 0
                        ? `${todayMealsCount} ${todayMealsCount === 1 ? 'refeição' : 'refeições'}`
                        : 'Vazio'}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    {mealsReady === false ? 'Carregando registros de hoje…' : todayMealsCount > 0
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
      </>
    )}
  </motion.div>

      {/* Painel de Notificações */}
      <NotificationsPanel isOpen={showNotifications} setIsOpen={setShowNotifications} />
    </div>
  );
}
