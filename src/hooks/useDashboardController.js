import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';
import { toPortugueseError } from '@/lib/utils/errorMessages';

/** Indica se o erro é de schema/migração (tabela ou RPC não existe) - não exibir toast nesses casos */
export const isSchemaOrMigrationError = (error) => {
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

export const buildDailySeries = (days, dateValues = []) => {
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

export function useDashboardController({ user, toast }) {
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
  
  const [statsLoading, setStatsLoading] = useState(true);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [noShowLoading, setNoShowLoading] = useState(true);

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

  const fetchAppointments = useCallback(async () => {
    if (!user || !user.id) return;
    setAppointmentsLoading(true);
    try {
      const today = new Date().toISOString();
      const { data, error } = await supabase
        .from('appointments')
        .select('id, start_time, appointment_time, patient:user_profiles!appointments_patient_id_fkey(id, name, avatar_url)')
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

  return {
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
  };
}
