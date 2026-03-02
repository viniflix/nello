import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  TrendingUp,
  Calendar,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import PatientUpdatesWidget from '@/components/nutritionist/PatientUpdatesWidget';
import NutritionistActivityFeed from '@/components/nutritionist/NutritionistActivityFeed';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StatCardSkeleton, AlertCardSkeleton } from '@/components/ui/card-skeleton';

/** Indica se o erro é de schema/migração (tabela ou RPC não existe) - não exibir toast nesses casos */
const isSchemaOrMigrationError = (error) => {
  if (!error) return false;
  const code = error?.code;
  const msg = String(error?.message || '').toLowerCase();
  return (
    code === 'PGRST202' || // função não encontrada
    code === 'PGRST205' || // tabela não encontrada
    code === '42703' ||    // coluna não existe
    msg.includes('does not exist') ||
    msg.includes('no matches were found in the schema cache')
  );
};

const buildDailySeries = (days, dateValues = []) => {
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));

  const labels = Array.from({ length: days }, (_, idx) => {
    const d = new Date(start);
    d.setDate(start.getDate() + idx);
    return format(d, 'yyyy-MM-dd');
  });

  const counter = {};
  dateValues.forEach((value) => {
    if (!value) return;
    const key = format(new Date(value), 'yyyy-MM-dd');
    counter[key] = (counter[key] || 0) + 1;
  });

  return labels.map((label) => counter[label] || 0);
};

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
  const diffMs = new Date(appointmentTime).getTime() - Date.now();
  const diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours <= 2) {
    return {
      label: 'Muito próxima',
      rowClass: 'border-red-300/80 bg-red-50/70',
      badgeClass: 'bg-red-100 text-red-700 border-red-200',
      dotClass: 'bg-red-500'
    };
  }

  if (diffHours <= 24) {
    return {
      label: 'Hoje',
      rowClass: 'border-orange-300/80 bg-orange-50/70',
      badgeClass: 'bg-orange-100 text-orange-700 border-orange-200',
      dotClass: 'bg-orange-500'
    };
  }

  if (diffHours <= 72) {
    return {
      label: 'Em breve',
      rowClass: 'border-amber-300/80 bg-amber-50/70',
      badgeClass: 'bg-amber-100 text-amber-700 border-amber-200',
      dotClass: 'bg-amber-500'
    };
  }

  return {
    label: 'Programada',
    rowClass: 'border-emerald-300/80 bg-emerald-50/70',
    badgeClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500'
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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div className="min-w-0 flex items-start gap-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="font-clash text-base md:text-lg font-semibold text-primary break-words">
                Agendamentos
              </CardTitle>
              <CardDescription className="text-muted-foreground text-xs md:text-sm">
                Próximas consultas e métricas de presença
              </CardDescription>
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap justify-end gap-1.5">
            {hasTodayTag && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getAgendaCountTagClass(todayAppointments)}`}>
                Hoje: {todayAppointments}
              </span>
            )}
            {hasTotalTag && (
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getAgendaCountTagClass(totalUpcoming)}`}>
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
              return (
                <motion.div
                  key={appt.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  className={`rounded-lg border p-2.5 ${urgency.rowClass}`}
                >
                  <div className="mb-2 flex justify-end">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgency.badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${urgency.dotClass}`} />
                      {urgency.label}
                    </span>
                  </div>
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex-shrink-0 flex items-center justify-center">
                      <span className="font-semibold text-emerald-700 text-xs">
                        {(profile?.name || 'P').substring(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="text-sm font-medium text-foreground truncate">{profile?.name || 'Paciente'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {format(parseISO(appt.start_time), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
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
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [appointmentsTodayCount, setAppointmentsTodayCount] = useState(0);
  const [appointmentsTotalCount, setAppointmentsTotalCount] = useState(0);
  const [noShowPeriodDays, setNoShowPeriodDays] = useState(30);
  const [noShowStats, setNoShowStats] = useState({
    noShowCount: 0,
    completedCount: 0,
    canceledCount: 0,
    eligibleCount: 0,
    noShowRate: 0
  });
  const [activePatients24h, setActivePatients24h] = useState(0);
  const [adherencePercent24h, setAdherencePercent24h] = useState('--%');
  const [adherentPatients24h, setAdherentPatients24h] = useState(0);
  const [newPatients30Days, setNewPatients30Days] = useState(0);
  const [patients90DaysSeries, setPatients90DaysSeries] = useState([]);
  const [active24hSeries, setActive24hSeries] = useState([]);
  const [adherence24hSeries, setAdherence24hSeries] = useState([]);
  // OTIMIZADO: Loading states independentes para carregamento progressivo
  const [statsLoading, setStatsLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [noShowLoading, setNoShowLoading] = useState(true);
  
  // OTIMIZADO: Função separada para carregar estatísticas
  const fetchStats = useCallback(async () => {
    if (!user || !user.id) return;
    setStatsLoading(true);
    try {
      const patientData = await supabase
        .from('user_profiles')
        .select('id, name, created_at')
        .eq('nutritionist_id', user.id)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        });

      const patientIds = patientData.map((patient) => patient.id);
      const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const mealLogs = patientIds.length
        ? await supabase
          .from('meals')
          .select('patient_id, created_at')
          .in('patient_id', patientIds)
          .gte('created_at', since24hIso)
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          })
        : [];

      setPatients(patientData);

      const last90DaysNew = patientData
        .filter((p) => p.created_at && new Date(p.created_at) >= new Date(Date.now() - 90 * 24 * 60 * 60 * 1000))
        .map((p) => p.created_at);
      const dailyNew90 = buildDailySeries(90, last90DaysNew);
      const baseTotal = Math.max(0, patientData.length - last90DaysNew.length);
      const cumulative90 = dailyNew90.reduce((acc, dayNew, index) => {
        const prev = index === 0 ? baseTotal : acc[index - 1];
        acc.push(prev + dayNew);
        return acc;
      }, []);
      setPatients90DaysSeries(cumulative90);

      const last30DaysNew = patientData.filter(
        (p) => p.created_at && new Date(p.created_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length;
      setNewPatients30Days(last30DaysNew);

      const interactionCounterByPatient = mealLogs.reduce((acc, log) => {
        acc[log.patient_id] = (acc[log.patient_id] || 0) + 1;
        return acc;
      }, {});

      const active24h = Object.values(interactionCounterByPatient).filter((count) => count >= 1).length;
      const adherent24h = Object.values(interactionCounterByPatient).filter((count) => count >= 2).length;
      const adherencePercent = patientIds.length
        ? Math.round((adherent24h / patientIds.length) * 100)
        : 0;

      setActivePatients24h(active24h);
      setAdherentPatients24h(adherent24h);
      setAdherencePercent24h(`${adherencePercent}%`);

      const hourLabels = Array.from({ length: 24 }, (_, idx) => {
        const hourDate = new Date(Date.now() - (23 - idx) * 60 * 60 * 1000);
        return format(hourDate, 'yyyy-MM-dd HH');
      });
      const activeByHour = {};
      const interactionsByHour = {};

      mealLogs.forEach((log) => {
        const key = format(new Date(log.created_at), 'yyyy-MM-dd HH');
        interactionsByHour[key] = (interactionsByHour[key] || 0) + 1;
        if (!activeByHour[key]) {
          activeByHour[key] = new Set();
        }
        activeByHour[key].add(log.patient_id);
      });

      const activeSeries = hourLabels.map((key) => activeByHour[key]?.size || 0);
      const adherenceSeries = hourLabels.map((key) => interactionsByHour[key] || 0);

      setActive24hSeries(activeSeries);
      setAdherence24hSeries(adherenceSeries);

    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
      toast({ title: "Erro ao carregar estatísticas", description: toPortugueseError(error, 'Não foi possível carregar as estatísticas.'), variant: "destructive" });
    } finally {
      setStatsLoading(false);
    }
  }, [user, toast]);

  // OTIMIZADO: Função separada para carregar agendamentos
  const fetchAppointments = useCallback(async () => {
    if (!user || !user.id) return;
    setAppointmentsLoading(true);
    try {
      const today = new Date().toISOString();
      const { data, error } = await supabase
        .from('appointments')
        .select('id, start_time, patient:appointments_patient_id_fkey(id, name, avatar_url)')
        .eq('nutritionist_id', user.id)
        .gte('start_time', today)
        .order('start_time', { ascending: true })
        .limit(3);

      if (error) throw error;
      setAppointments(data || []);

      const todayDateOnly = new Date().toISOString().split('T')[0];
      const [{ count: totalUpcomingCount, error: totalError }, { count: todayCount, error: todayError }] = await Promise.all([
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('nutritionist_id', user.id)
          .gte('start_time', today),
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('nutritionist_id', user.id)
          .gte('start_time', `${todayDateOnly}T00:00:00`)
          .lte('start_time', `${todayDateOnly}T23:59:59`)
      ]);

      if (totalError) throw totalError;
      if (todayError) throw todayError;
      setAppointmentsTotalCount(totalUpcomingCount || 0);
      setAppointmentsTodayCount(todayCount || 0);
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
      if (!isSchemaOrMigrationError(error)) {
        toast({ title: "Erro ao carregar agendamentos", description: toPortugueseError(error, 'Não foi possível carregar os agendamentos.'), variant: "destructive" });
      }
    } finally {
      setAppointmentsLoading(false);
    }
  }, [user, toast]);

  const fetchNoShowStats = useCallback(async () => {
    if (!user?.id) return;
    setNoShowLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const sinceIso = new Date(Date.now() - noShowPeriodDays * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('appointments')
        .select('status')
        .eq('nutritionist_id', user.id)
        .gte('start_time', sinceIso)
        .lte('start_time', nowIso);

      if (error) throw error;

      const rows = data || [];
      const noShowCount = rows.filter((row) => row.status === 'no_show').length;
      const completedCount = rows.filter((row) => row.status === 'completed').length;
      const canceledCount = rows.filter((row) => row.status === 'canceled' || row.status === 'cancelled').length;
      const eligibleCount = noShowCount + completedCount;
      const noShowRate = eligibleCount > 0 ? Math.round((noShowCount / eligibleCount) * 100) : 0;

      setNoShowStats({
        noShowCount,
        completedCount,
        canceledCount,
        eligibleCount,
        noShowRate
      });
    } catch (error) {
      console.error('Erro ao carregar métricas de no-show:', error);
      if (!isSchemaOrMigrationError(error)) {
        toast({
          title: 'Erro no no-show',
          description: toPortugueseError(error, 'Não foi possível carregar as métricas de no-show.'),
          variant: 'destructive'
        });
      }
    } finally {
      setNoShowLoading(false);
    }
  }, [user?.id, noShowPeriodDays, toast]);

  useEffect(() => {
    if (user?.id) {
      fetchStats();
      fetchAppointments();
      fetchNoShowStats();
    }
  }, [user?.id, fetchStats, fetchAppointments, fetchNoShowStats]);

  return (
    <div className="flex flex-col min-h-screen lg:h-[calc(100vh-4rem)] min-h-0 bg-background lg:overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col lg:h-full max-w-7xl mx-auto w-full px-4 md:px-6 pt-3 md:pt-4 pb-4 min-w-0 overflow-x-hidden"
      >
        {/* Header compacto */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl md:text-2xl font-bold font-heading uppercase tracking-wide text-primary break-words">
              Dashboard
            </h2>
            <p className="text-neutral-600 text-xs md:text-sm mt-0.5">
              Gerencie seus pacientes, Planos e Análises.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center sm:justify-end">
            <Button variant="secondary" size="sm" onClick={() => navigate('/nutritionist/patients')}>
              <Users className="h-4 w-4 mr-1.5" />
              Ver todos os pacientes
            </Button>
          </div>
        </div>

        {/* Grid principal: Feed e Registros alinhados no final */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 flex-1 min-h-0">

          {/* Coluna Lateral - Agendamentos + Registros (desktop: direita; mobile: após agendamentos) */}
          <div className="flex flex-col min-h-0 lg:col-span-1 lg:order-last order-3 gap-4">
            <div className="hidden lg:block shrink-0">
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
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <PatientUpdatesWidget />
            </div>
          </div>

          {/* Coluna Principal - Stats + Feed */}
          <div className="flex flex-col min-h-0 lg:col-span-2 order-first gap-4">
            {/* Cards de Estatística */}
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 shrink-0">
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
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                      <CardTitle className="font-heading uppercase text-[10px] lg:text-xs font-medium text-white/80 tracking-wide leading-tight">
                        Total Pacientes
                      </CardTitle>
                      <Users className="h-4 w-4 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative py-2 px-3">
                      <div className="text-2xl lg:text-3xl font-bold text-white">
                        {patients.length}
                      </div>
                      <p className="text-[10px] text-white/70">Evolução 90 dias</p>
                    </CardContent>
                  </Card>

                  {/* Card 2: Pacientes Ativos (Neutro Escuro) - Mobile: posição 2, Desktop: posição 3 */}
                  <Card className="relative overflow-hidden bg-neutral-800 text-white border-0 shadow-card-dark lg:order-3">
                    <Sparkline data={active24hSeries} />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                      <CardTitle className="font-heading uppercase text-[10px] lg:text-xs font-medium text-white/80 tracking-wide leading-tight">
                        Pacientes Ativos
                      </CardTitle>
                      <UserCheck className="h-4 w-4 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative py-2 px-3">
                      <div className="text-2xl lg:text-3xl font-bold text-white">
                        {activePatients24h}
                      </div>
                      <p className="text-[10px] text-white/70">{newPatients30Days} novos (30d)</p>
                    </CardContent>
                  </Card>

                  {/* Card 3: Adesão */}
                  <Card className="relative overflow-hidden bg-secondary text-white border-0 shadow-card-dark col-span-2 lg:col-span-1 lg:order-2">
                    <Sparkline data={adherence24hSeries} />
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-1">
                      <CardTitle className="font-heading uppercase text-[10px] lg:text-xs font-medium text-white/80 tracking-wide leading-tight">
                        Adesão 24h
                      </CardTitle>
                      <TrendingUp className="h-4 w-4 text-white/80 flex-shrink-0" />
                    </CardHeader>
                    <CardContent className="relative py-2 px-3">
                      <div className="text-2xl lg:text-3xl font-bold text-white">
                        {adherencePercent24h}
                      </div>
                      <p className="text-[10px] text-white/70">{adherentPatients24h}/{patients.length} ativos</p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            {/* Feed do Nutricionista - preenche espaço e alinha com Registros */}
            <div id="nutritionist-activity-feed" className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <NutritionistActivityFeed />
            </div>

          </div>

          {/* Mobile: Agendamentos entre Stats e Feed */}
          <div className="lg:hidden order-2 shrink-0">
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