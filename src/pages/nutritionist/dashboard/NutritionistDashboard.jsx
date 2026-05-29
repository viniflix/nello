import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  TrendingUp,
  Calendar,
  ChevronDown
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import PatientUpdatesWidget from '@/components/nutritionist/PatientUpdatesWidget';
import NutritionistActivityFeed from '@/components/nutritionist/NutritionistActivityFeed';
import { PendingAnamnesisWidget } from '@/components/anamnesis/PendingAnamnesisWidget';
import { format, parseISO, isToday, isTomorrow, isThisWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StatCardSkeleton, AlertCardSkeleton } from '@/components/ui/card-skeleton';
import { useDashboardController } from '@/hooks/useDashboardController';



const Sparkline = ({ data = [] }) => {
  if (!data.length) return null;

  const max = Math.max(...data, 1);
  const width = 140;
  const height = 44;
  const step = width / Math.max(1, data.length - 1);
  const points = data
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 4);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="pointer-events-none absolute right-2 bottom-2 opacity-35">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-11 w-36" aria-hidden="true">
        <polyline
          points={points}
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

const getAgendaCountTagClass = (count) => {
  if (count >= 5) return 'bg-secondary/15 text-secondary border-secondary/30';
  if (count >= 3) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  return 'bg-primary/15 text-primary border-primary/30';
};

const getUrgencyMeta = (appointmentTime) => {
  const apptDate = new Date(appointmentTime);
  const now = new Date();
  const diffMs = apptDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  // "Muito próxima" = nas próximas 2h (independente do dia)
  if (diffHours > 0 && diffHours <= 2) {
    return {
      label: 'Muito próxima',
      rowClass: 'border-red-300 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10',
      badgeClass: 'bg-red-500/15 text-red-700 border-red-300 dark:text-red-400 dark:border-red-500/30',
      dotClass: 'bg-red-600'
    };
  }

  // "Hoje" = mesmo dia calendário
  if (isToday(apptDate)) {
    return {
      label: 'Hoje',
      rowClass: 'border-amber-400 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
      badgeClass: 'bg-amber-500/15 text-amber-800 border-amber-400 dark:text-amber-400 dark:border-amber-500/30',
      dotClass: 'bg-amber-600'
    };
  }

  // "Amanhã" = dia seguinte
  if (isTomorrow(apptDate)) {
    return {
      label: 'Amanhã',
      rowClass: 'border-sky-300 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10',
      badgeClass: 'bg-sky-500/15 text-sky-800 border-sky-400 dark:text-sky-400 dark:border-sky-500/30',
      dotClass: 'bg-sky-600'
    };
  }

  // "Em breve" = esta semana
  if (isThisWeek(apptDate, { weekStartsOn: 0 })) {
    return {
      label: 'Em breve',
      rowClass: 'border-violet-300 bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/10',
      badgeClass: 'bg-violet-500/15 text-violet-800 border-violet-400 dark:text-violet-400 dark:border-violet-500/30',
      dotClass: 'bg-violet-600'
    };
  }

  return {
    label: 'Programada',
    rowClass: 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/15 text-emerald-800 border-emerald-400 dark:text-emerald-400 dark:border-emerald-500/30',
    dotClass: 'bg-emerald-600'
  };
};

// --- MEGA CARD 2.0: Agendamentos (Próximas Consultas + No-show expansível) ---
const AppointmentsCard2 = ({
  appointments = [],
  totalUpcoming = 0,
  todayAppointments = 0,
  appointmentsLoading,
  noShowStats,
  noShowLoading,
  noShowPeriodDays,
  onNoShowPeriodChange
}) => {
  const navigate = useNavigate();
  const [noShowExpanded, setNoShowExpanded] = useState(false);
  const hasTodayTag = todayAppointments > 0;
  const hasTotalTag = totalUpcoming > 0;
  const periodOptions = [{ value: 7, label: '7d' }, { value: 30, label: '30d' }, { value: 90, label: '90d' }];

  const handleGoToAgenda = () => navigate('/nutritionist/agenda');

  if (appointmentsLoading) {
    return <AlertCardSkeleton />;
  }

  return (
    <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden border-primary/10">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
          <div className="min-w-0 flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5 flex-shrink-0">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <CardTitle className="font-clash text-base md:text-lg font-semibold text-primary">
                Agendamentos
              </CardTitle>
              <CardDescription className="text-muted-foreground text-xs truncate whitespace-nowrap">
                Próximas consultas e métricas
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {hasTodayTag && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${getAgendaCountTagClass(todayAppointments)}`}>
                Hoje: {todayAppointments}
              </span>
            )}
            {hasTotalTag && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${getAgendaCountTagClass(totalUpcoming)}`}>
                Total: {totalUpcoming}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Próximas consultas */}
        {appointments.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="space-y-3"
          >
            {appointments.map((appt, idx) => {
              const profile = appt.patient;
              const urgency = getUrgencyMeta(appt.start_time);
              const startTime = appt.start_time || appt.appointment_time;
              return (
                <motion.div
                  key={appt.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  className={`rounded-lg border p-2 ${urgency.rowClass}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-9 w-9 flex-shrink-0">
                      <AvatarImage src={profile?.avatar_url} alt={profile?.name} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                        {(profile?.name || 'P').substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-sm font-medium text-foreground truncate">{profile?.name || 'Paciente'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {startTime ? format(parseISO(startTime), "d 'de' MMMM 'às' HH:mm", { locale: ptBR }) : '—'}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium flex-shrink-0 ${urgency.badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${urgency.dotClass}`} />
                      {urgency.label}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-dashed border-border bg-muted/20 py-6 px-4 text-center"
          >
            <Calendar className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhuma consulta agendada</p>
            <p className="text-xs text-muted-foreground mt-0.5">Agende sua primeira consulta na agenda</p>
          </motion.div>
        )}

        {/* CTA Agenda - sempre visível */}
        <Button variant="outline" size="sm" className="w-full" onClick={handleGoToAgenda}>
          <Calendar className="h-4 w-4 mr-2" />
          {appointments.length > 0 ? 'Ver agenda completa' : 'Abrir agenda'}
        </Button>

        {/* Seção No-show expansível */}
        <div className="border-t pt-4">
          <button
            type="button"
            onClick={() => setNoShowExpanded((e) => !e)}
            className="flex w-full items-center justify-between rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-left transition hover:bg-muted/20"
          >
            <span className="text-sm font-medium text-foreground">Métricas de presença</span>
            <motion.span animate={{ rotate: noShowExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </motion.span>
          </button>
          <motion.div
            initial={false}
            animate={{
              height: noShowExpanded ? 'auto' : 0,
              opacity: noShowExpanded ? 1 : 0
            }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <motion.div
              initial={false}
              animate={{ y: noShowExpanded ? 0 : -8 }}
              transition={{ duration: 0.2 }}
              className="pt-3 space-y-3"
            >
                  <div className="flex justify-end">
                    <div className="inline-flex rounded-md border bg-muted/20 p-0.5">
                      {periodOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => onNoShowPeriodChange(opt.value)}
                          className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                            noShowPeriodDays === opt.value ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {noShowLoading ? (
                    <div className="h-24 rounded-lg bg-muted/20 animate-pulse" />
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                          <p className="text-[11px] text-red-700">No-show</p>
                          <p className="text-lg font-semibold text-red-700">{noShowStats?.noShowCount ?? 0}</p>
                        </div>
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                          <p className="text-[11px] text-emerald-700">Concluídas</p>
                          <p className="text-lg font-semibold text-emerald-700">{noShowStats?.completedCount ?? 0}</p>
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/20 p-2">
                        <p className="text-[11px] text-muted-foreground">Taxa de no-show</p>
                        <p className="text-xl font-semibold text-foreground">{noShowStats?.noShowRate ?? 0}%</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Base: {noShowStats?.eligibleCount ?? 0} consultas
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                        Canceladas no período: {noShowStats?.canceledCount ?? 0}
                      </div>
                    </>
                  )}
            </motion.div>
          </motion.div>
        </div>
      </CardContent>
    </Card>
  );
};

// --- COMPONENTE PRINCIPAL DO DASHBOARD ---
export default function NutritionistDashboard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const {
    patients,
    appointments,
    appointmentsTodayCount,
    appointmentsTotalCount,
    noShowPeriodDays,
    setNoShowPeriodDays,
    noShowStats,
    activePatients24h,
    adherencePercent24h,
    adherentPatients24h,
    newPatients30Days,
    patients90DaysSeries,
    active24hSeries,
    adherence24hSeries,
    statsLoading,
    appointmentsLoading,
    noShowLoading
  } = useDashboardController({ user, toast });

  return (
    <div className="flex flex-col min-h-screen bg-background"> 
      
      
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-4 md:pt-8 pb-5 min-w-0 overflow-x-hidden"
      >
        {/* Zona de Ação Rápida */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 md:mb-8 text-center sm:text-left">
          {/* Lado Esquerdo: Título e Descrição */}
          <div className="min-w-0">
            <h2 className="text-2xl md:text-3xl font-bold font-heading uppercase tracking-wide text-primary break-words">
              Dashboard
            </h2>
            <p className="text-neutral-600 text-sm md:text-base mt-0.5">
              Gerencie seus pacientes, Planos e Análises.
            </p>
          </div>

          {/* Lado Direito: Ação Rápida */}
          <div className="flex gap-2 flex-wrap justify-center sm:justify-end">
            <Button variant="secondary" onClick={() => navigate('/nutritionist/patients')}>
              <Users className="h-4 w-4 mr-2" />
              Ver todos os pacientes
            </Button>
          </div>
        </div>


        {/* --- Conteúdo da Página --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Coluna Lateral - Desktop à direita, Mobile: apenas Registros Recentes */}
          <div className="lg:col-span-1 space-y-8 lg:order-last order-3">
            {/* Agendamentos 2.0 (Próximas + No-show expansível) - Desktop */}
            <div className="hidden lg:block">
              <AppointmentsCard2
                appointments={appointments}
                totalUpcoming={appointmentsTotalCount}
                todayAppointments={appointmentsTodayCount}
                appointmentsLoading={appointmentsLoading}
                noShowStats={noShowStats}
                noShowLoading={noShowLoading}
                noShowPeriodDays={noShowPeriodDays}
                onNoShowPeriodChange={setNoShowPeriodDays}
              />
            </div>
            <PatientUpdatesWidget />
            {/* Sprint G: Anamneses aguardando resposta */}
            <PendingAnamnesisWidget />
          </div>

          {/* Coluna Principal - Desktop à esquerda, Mobile no início */}
          <div className="lg:col-span-2 space-y-8 lg:order-first order-1">
            {/* Cards de Estatística - Layout 2x1 no mobile, 3 colunas no desktop */}
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 mb-6">
              {/* OTIMIZADO: Mostra skeletons enquanto carrega, depois mostra dados reais */}
              {statsLoading ? (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <div className="col-span-2 lg:col-span-1">
                    <StatCardSkeleton />
                  </div>
                </>
              ) : (
                <>
                  {/* Card 1: Pacientes (Verde) */}
                  <Card className="relative overflow-hidden bg-primary text-white border-0 shadow-card-dark">
                    <Sparkline data={patients90DaysSeries} />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-heading uppercase text-xs lg:text-sm font-medium text-white/80 tracking-wide leading-tight">
                        Total Pacientes
                      </CardTitle>
                      <Users className="h-5 w-5 lg:h-6 lg:w-6 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="text-3xl lg:text-4xl font-bold text-white">
                        {patients.length}
                      </div>
                      <p className="text-xs text-white/70">
                        Evolução dos últimos 90 dias
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 2: Pacientes Ativos (Neutro Escuro) - Mobile: posição 2, Desktop: posição 3 */}
                  <Card className="relative overflow-hidden bg-neutral-800 text-white border-0 shadow-card-dark lg:order-3">
                    <Sparkline data={active24hSeries} />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-heading uppercase text-xs lg:text-sm font-medium text-white/80 tracking-wide leading-tight">
                        Pacientes Ativos
                      </CardTitle>
                      <UserCheck className="h-5 w-5 lg:h-6 lg:w-6 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="text-3xl lg:text-4xl font-bold text-white">
                        {activePatients24h}
                      </div>
                      <p className="text-xs text-white/70 leading-tight">
                        {newPatients30Days} novos nos últimos 30 dias
                      </p>
                    </CardContent>
                  </Card>

                  {/* Card 3: Adesão (Laranja) - Mobile: ocupa 2 colunas embaixo, Desktop: posição 2 */}
                  <Card className="relative overflow-hidden bg-secondary text-white border-0 shadow-card-dark col-span-2 lg:col-span-1 lg:order-2">
                    <Sparkline data={adherence24hSeries} />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                      <CardTitle className="font-heading uppercase text-xs lg:text-sm font-medium text-white/80 tracking-wide leading-tight">
                        Adesão 24h
                      </CardTitle>
                      <TrendingUp className="h-5 w-5 lg:h-6 lg:w-6 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative">
                      <div className="text-3xl lg:text-4xl font-bold text-white">
                        {adherencePercent24h}
                      </div>
                      <p className="text-xs text-white/70">
                        {adherentPatients24h}/{patients.length} com 2+ registros
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Feed do Nutricionista (Alertas e Pendências) - Desktop e Mobile no final */}
            <div id="nutritionist-activity-feed">
              <NutritionistActivityFeed />
            </div>

          </div>

          {/* Mobile: Agendamentos 2.0 entre Cards e Feed */}
          <div className="lg:hidden order-2">
            <AppointmentsCard2
              appointments={appointments}
              totalUpcoming={appointmentsTotalCount}
              todayAppointments={appointmentsTodayCount}
              appointmentsLoading={appointmentsLoading}
              noShowStats={noShowStats}
              noShowLoading={noShowLoading}
              noShowPeriodDays={noShowPeriodDays}
              onNoShowPeriodChange={setNoShowPeriodDays}
            />
          </div>

        </div>
      </motion.div>
    </div>
  );
}