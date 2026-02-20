import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserCheck,
  TrendingUp,
  ClipboardList,
  AlertTriangle,
  CalendarX2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/customSupabaseClient';
import { getOperationalHealthSummary } from '@/lib/supabase/observability-queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import PatientUpdatesWidget from '@/components/nutritionist/PatientUpdatesWidget';
import NutritionistActivityFeed from '@/components/nutritionist/NutritionistActivityFeed';
import { toPortugueseError } from '@/lib/utils/errorMessages';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { StatCardSkeleton, AlertCardSkeleton } from '@/components/ui/card-skeleton';

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

const BacklogOperationalWidget = ({ stats, onOpenFeed }) => {
  const { openCount, snoozedCount, criticalCount, attentionCount, highRiskLabCount } = stats;
  return (
    <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="font-clash text-base md:text-lg font-semibold text-primary break-words">
          Backlog Operacional
        </CardTitle>
        <CardDescription className="text-muted-foreground text-xs md:text-sm">
          Pendências do feed inteligente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border bg-muted/20 p-2">
            <p className="text-[11px] text-muted-foreground">Abertas</p>
            <p className="text-lg font-semibold text-foreground">{openCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-2">
            <p className="text-[11px] text-muted-foreground">Adiadas</p>
            <p className="text-lg font-semibold text-foreground">{snoozedCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
            <AlertTriangle className="h-3 w-3" />
            Crítico: {criticalCount}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
            Exames risco alto: {highRiskLabCount || 0}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
            Atenção: {attentionCount}
          </span>
        </div>
        <Button variant="outline" size="sm" className="w-full" onClick={onOpenFeed}>
          <ClipboardList className="h-4 w-4 mr-2" />
          Abrir feed e priorizar
        </Button>
      </CardContent>
    </Card>
  );
};

// --- WIDGET (DIREITA): Próximas Consultas ---
const UpcomingAppointmentsWidget = ({ appointments, totalUpcoming, todayAppointments }) => {
  const navigate = useNavigate();
  const hasTodayTag = todayAppointments > 0;
  const hasTotalTag = totalUpcoming > 0;
  
  return (
    <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <CardTitle className="font-clash text-base md:text-lg font-semibold text-primary break-words">
              Próximas Consultas
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs md:text-sm">
              Seus próximos agendamentos.
            </CardDescription>
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
      <CardContent>
        {appointments.length > 0 ? (
          <div className="space-y-4">
            {appointments.map(appt => {
              const profile = appt.patient; 
              const urgency = getUrgencyMeta(appt.start_time);
              return (
                <div key={appt.id} className={`rounded-lg border p-2.5 ${urgency.rowClass}`}>
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
                    <p className="text-sm font-medium text-foreground truncate">{profile?.name || 'Paciente (Excluído)'}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {format(parseISO(appt.start_time), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                </div>
              );
            })}
            <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate('/nutritionist/agenda')}>
              Ver agenda completa
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma consulta agendada.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

const NoShowInsightsWidget = ({ loading, periodDays, onPeriodChange, stats }) => {
  const periodOptions = [
    { value: 7, label: '7d' },
    { value: 30, label: '30d' },
    { value: 90, label: '90d' }
  ];

  if (loading) {
    return <AlertCardSkeleton />;
  }

  return (
    <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-clash text-base md:text-lg font-semibold text-primary break-words">
              No-show por Período
            </CardTitle>
            <CardDescription className="text-muted-foreground text-xs md:text-sm">
              Taxa operacional de ausência na agenda
            </CardDescription>
          </div>
          <div className="inline-flex rounded-md border bg-muted/20 p-0.5">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onPeriodChange(option.value)}
                className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                  periodDays === option.value
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-red-200 bg-red-50 p-2">
            <p className="text-[11px] text-red-700">No-show</p>
            <p className="text-lg font-semibold text-red-700">{stats.noShowCount}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
            <p className="text-[11px] text-emerald-700">Concluídas</p>
            <p className="text-lg font-semibold text-emerald-700">{stats.completedCount}</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <p className="text-[11px] text-muted-foreground">Taxa de no-show</p>
          <p className="text-xl font-semibold text-foreground">{stats.noShowRate}%</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Base: {stats.eligibleCount} consultas (concluídas + faltas)
          </p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
          <CalendarX2 className="h-3 w-3" />
          Canceladas no período: {stats.canceledCount}
        </div>
      </CardContent>
    </Card>
  );
};

const ObservabilityWidget = ({ loading, summary }) => {
  if (loading) {
    return <AlertCardSkeleton />;
  }

  const moduleStats = Array.isArray(summary?.module_stats) ? summary.module_stats : [];
  const topModules = moduleStats
    .slice()
    .sort((a, b) => Number(b?.error_events || 0) - Number(a?.error_events || 0))
    .slice(0, 3);

  return (
    <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="font-clash text-base md:text-lg font-semibold text-primary break-words">
          Observabilidade Técnica
        </CardTitle>
        <CardDescription className="text-muted-foreground text-xs md:text-sm">
          Erros e latência dos fluxos nas últimas 24h
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-muted/20 p-2">
            <p className="text-[11px] text-muted-foreground">Eventos</p>
            <p className="text-lg font-semibold text-foreground">{summary?.total_events || 0}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-2">
            <p className="text-[11px] text-red-700">Erros</p>
            <p className="text-lg font-semibold text-red-700">{summary?.error_events || 0}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
            <p className="text-[11px] text-amber-700">Latência</p>
            <p className="text-lg font-semibold text-amber-700">{Number(summary?.avg_latency_ms || 0).toFixed(0)} ms</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <p className="text-[11px] text-muted-foreground">Taxa de erro</p>
          <p className="text-xl font-semibold text-foreground">{Number(summary?.error_rate || 0).toFixed(1)}%</p>
        </div>

        <div className="space-y-1">
          {topModules.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem eventos instrumentados no período.</p>
          ) : (
            topModules.map((item) => (
              <div key={item.module} className="flex items-center justify-between rounded border border-border/60 bg-muted/10 px-2 py-1.5 text-xs">
                <span className="font-medium text-foreground">{item.module}</span>
                <span className="text-muted-foreground">
                  {item.error_events}/{item.total_events} erros • {Number(item.avg_latency_ms || 0).toFixed(0)} ms
                </span>
              </div>
            ))
          )}
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
  const [operationalSummary, setOperationalSummary] = useState({
    total_events: 0,
    error_events: 0,
    error_rate: 0,
    avg_latency_ms: 0,
    module_stats: []
  });
  const [activePatients24h, setActivePatients24h] = useState(0);
  const [adherencePercent24h, setAdherencePercent24h] = useState('--%');
  const [adherentPatients24h, setAdherentPatients24h] = useState(0);
  const [newPatients30Days, setNewPatients30Days] = useState(0);
  const [patients90DaysSeries, setPatients90DaysSeries] = useState([]);
  const [active24hSeries, setActive24hSeries] = useState([]);
  const [adherence24hSeries, setAdherence24hSeries] = useState([]);
  const [backlogStats, setBacklogStats] = useState({
    openCount: 0,
    snoozedCount: 0,
    criticalCount: 0,
    attentionCount: 0,
    highRiskLabCount: 0
  });

  // OTIMIZADO: Loading states independentes para carregamento progressivo
  const [statsLoading, setStatsLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [backlogLoading, setBacklogLoading] = useState(true);
  const [noShowLoading, setNoShowLoading] = useState(true);
  const [observabilityLoading, setObservabilityLoading] = useState(true);
  
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
      toast({ title: "Erro ao carregar agendamentos", description: toPortugueseError(error, 'Não foi possível carregar os agendamentos.'), variant: "destructive" });
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
      toast({
        title: 'Erro no no-show',
        description: toPortugueseError(error, 'Não foi possível carregar as métricas de no-show.'),
        variant: 'destructive'
      });
    } finally {
      setNoShowLoading(false);
    }
  }, [user?.id, noShowPeriodDays, toast]);

  const fetchOperationalSummary = useCallback(async () => {
    if (!user?.id) return;
    setObservabilityLoading(true);
    try {
      const { data, error } = await getOperationalHealthSummary({
        nutritionistId: user.id,
        windowHours: 24
      });
      if (error) throw error;

      setOperationalSummary({
        total_events: Number(data?.total_events || 0),
        error_events: Number(data?.error_events || 0),
        error_rate: Number(data?.error_rate || 0),
        avg_latency_ms: Number(data?.avg_latency_ms || 0),
        module_stats: Array.isArray(data?.module_stats) ? data.module_stats : []
      });
    } catch (error) {
      console.error('Erro ao carregar observabilidade técnica:', error);
      toast({
        title: 'Erro na observabilidade',
        description: toPortugueseError(error, 'Não foi possível carregar o painel técnico.'),
        variant: 'destructive'
      });
    } finally {
      setObservabilityLoading(false);
    }
  }, [user?.id, toast]);

  const fetchBacklogStats = useCallback(async () => {
    if (!user?.id) return;
    setBacklogLoading(true);
    try {
      const { data, error } = await supabase
        .from('feed_tasks')
        .select('status, source_type, snooze_until, first_seen_at, created_at')
        .eq('nutritionist_id', user.id);

      if (error) throw error;

      const rows = data || [];
      const now = Date.now();
      const openRows = rows.filter((row) => row.status === 'open');
      const snoozedRows = rows.filter((row) => {
        if (row.status !== 'snoozed') return false;
        const until = row.snooze_until ? new Date(row.snooze_until).getTime() : 0;
        return until > now;
      });

      const withAge = openRows.map((row) => {
        const baseDate = row.first_seen_at || row.created_at;
        const ageHours = baseDate ? (now - new Date(baseDate).getTime()) / (1000 * 60 * 60) : 0;
        return Number.isFinite(ageHours) ? ageHours : 0;
      });

      const criticalCount = withAge.filter((age) => age >= 48).length;
      const attentionCount = withAge.filter((age) => age >= 24 && age < 48).length;
      const highRiskLabCount = openRows.filter((row) => row.source_type === 'lab_high_risk').length;

      setBacklogStats({
        openCount: openRows.length,
        snoozedCount: snoozedRows.length,
        criticalCount,
        attentionCount,
        highRiskLabCount
      });
    } catch (error) {
      console.error('Erro ao carregar backlog operacional:', error);
      toast({ title: 'Erro no backlog', description: toPortugueseError(error, 'Não foi possível carregar o backlog operacional.'), variant: 'destructive' });
    } finally {
      setBacklogLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    if (user?.id) {
      // OTIMIZADO: Carrega dados em paralelo de forma independente
      fetchStats();
      fetchAppointments();
      fetchBacklogStats();
      fetchNoShowStats();
      fetchOperationalSummary();
    }
  }, [user?.id, fetchStats, fetchAppointments, fetchBacklogStats, fetchNoShowStats, fetchOperationalSummary]);

  return (
    <div className="flex flex-col min-h-screen bg-background"> 
      
      
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-7xl mx-auto w-full px-4 md:px-8 pt-4 md:pt-8 min-w-0 overflow-x-hidden"
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
            {/* Próximas Consultas - Apenas Desktop */}
            <div className="hidden lg:block">
              {appointmentsLoading ? (
                <AlertCardSkeleton />
              ) : (
                <UpcomingAppointmentsWidget
                  appointments={appointments}
                  totalUpcoming={appointmentsTotalCount}
                  todayAppointments={appointmentsTodayCount}
                />
              )}
            </div>
            {backlogLoading ? (
              <AlertCardSkeleton />
            ) : (
              <BacklogOperationalWidget
                stats={backlogStats}
                onOpenFeed={() => {
                  const feedElement = document.getElementById('nutritionist-activity-feed');
                  if (feedElement) {
                    feedElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
              />
            )}
            <NoShowInsightsWidget
              loading={noShowLoading}
              periodDays={noShowPeriodDays}
              onPeriodChange={setNoShowPeriodDays}
              stats={noShowStats}
            />
            <ObservabilityWidget
              loading={observabilityLoading}
              summary={operationalSummary}
            />
            <PatientUpdatesWidget />
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

          {/* Mobile: Próximas Consultas entre Cards e Feed */}
          <div className="lg:hidden order-2">
            {appointmentsLoading ? (
              <AlertCardSkeleton />
            ) : (
              <UpcomingAppointmentsWidget
                appointments={appointments}
                totalUpcoming={appointmentsTotalCount}
                todayAppointments={appointmentsTodayCount}
              />
            )}
          </div>

        </div>
      </motion.div>
    </div>
  );
}