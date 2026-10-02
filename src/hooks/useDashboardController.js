
import { useState, useEffect, useCallback, useRef } from 'react';
import { failurePresentation, classifyFailure, settleResources } from '@/lib/utils/failure';
import { captureOperationalError } from '@/infrastructure/observability/telemetry';
import { supabase } from '@/lib/customSupabaseClient';
import { format } from 'date-fns';

import { Events, track } from '@/infrastructure/analytics/posthog';

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

export function useDashboardController({ user }) {
  const owner=useRef(user?.id);owner.current=user?.id;
  const controllers=useRef({});
  const requests=useRef({stats:0,appointments:0,noShow:0});
  const [failures,setFailures]=useState({});
  const [dataOwner,setDataOwner]=useState(user?.id);
  const reportFailure=useCallback((key,error)=>{
    if(classifyFailure(error)==='aborted')return;
    const correlationId=captureOperationalError(error,{operation:'dashboard_'+key,module:'dashboard',source:'supabase'});
    setFailures(previous=>({...previous,[key]:{...failurePresentation(error),correlationId}}));
  },[]);
  const clearFailure=useCallback(key=>setFailures(previous=>{const next={...previous};delete next[key];return next;}),[]);
  useEffect(()=>{
    owner.current=user?.id;setDataOwner(user?.id);setFailures({});setPatients([]);setAppointments([]);
    setAppointmentsTodayCount(0);setAppointmentsTotalCount(0);setActivePatients24h(0);
    setAdherencePercent24h('--%');setAdherentPatients24h(0);setNewPatients30Days(0);
    setPatients90DaysSeries([]);setActive24hSeries([]);setAdherence24hSeries([]);
    setNoShowStats({noShowCount:0,completedCount:0,canceledCount:0,eligibleCount:0,noShowRate:0});
    const pendingControllers=controllers.current;
    return()=>{owner.current=null;Object.values(pendingControllers).forEach(controller=>controller.abort());};
  },[user?.id]);
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
    const account=user?.id,ticket=++requests.current.stats;
    const current=()=>owner.current===account&&requests.current.stats===ticket;
    clearFailure('stats');
    if (!user?.id) return;
    controllers.current.stats?.abort();const controller=new AbortController();controllers.current.stats=controller;
    const timeout=setTimeout(()=>controller.abort(new DOMException('request_timeout','TimeoutError')),15000);
    const started = performance.now();
    setStatsLoading(true);
    try {
      const patientData = await supabase
        .from('user_profiles')
        .select('id, name, created_at')
          .abortSignal(controller.signal)
        .eq('nutritionist_id', user.id)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return data || [];
        });

      if(!current())return;
      setPatients(patientData);
      const patientIds = patientData.map((patient) => patient.id);
      const since24hIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const mealLogs = patientIds.length
        ? await supabase
          .from('meals')
          .select('patient_id, created_at')
          .abortSignal(controller.signal)
          .in('patient_id', patientIds)
          .gte('created_at', since24hIso)
          .then(({ data, error }) => {
            if (error) throw error;
            return data || [];
          })
        : [];

      if(!current())return;

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
      track(Events.DATA_LOAD_TIMING, { operation: 'dashboard_stats', duration_ms: Math.round(performance.now() - started), result_count: patientData.length });

    } catch(error){
      if(!current())return;
      reportFailure('stats',controller.signal.aborted?controller.signal.reason:error);
    } finally {
      clearTimeout(timeout);
      if(current())setStatsLoading(false);
    }
  }, [user?.id, clearFailure, reportFailure]);

  const fetchAppointments = useCallback(async () => {
    const account=user?.id,ticket=++requests.current.appointments;
    const current=()=>owner.current===account&&requests.current.appointments===ticket;
    clearFailure('appointments');
    if (!user?.id) return;
    controllers.current.appointments?.abort();const controller=new AbortController();controllers.current.appointments=controller;
    const timeout=setTimeout(()=>controller.abort(new DOMException('request_timeout','TimeoutError')),15000);
    const started = performance.now();
    setAppointmentsLoading(true);
    try {
      const today = new Date().toISOString();
      const { data, error } = await supabase
        .from('appointments')
        .select('id, start_time, appointment_time, patient:user_profiles!appointments_patient_id_fkey(id, name, avatar_url)')
          .abortSignal(controller.signal)
        .eq('nutritionist_id', user.id)
        .gte('start_time', today)
        .order('start_time', { ascending: true })
        .limit(3);

      if (error) throw error;
      if(!current())return;
      setAppointments(data || []);

      const localDayStart = new Date();
      localDayStart.setHours(0, 0, 0, 0);
      const nextLocalDay = new Date(localDayStart);
      nextLocalDay.setDate(nextLocalDay.getDate() + 1);
      const counts=await settleResources({total:()=>
        supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .abortSignal(controller.signal)
          .eq('nutritionist_id', user.id)
          .gte('start_time', today).then(result=>({...result,data:result.count})),
        today:()=>supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .abortSignal(controller.signal)
          .eq('nutritionist_id', user.id)
          .gte('start_time', localDayStart.toISOString())
          .lt('start_time', nextLocalDay.toISOString()).then(result=>({...result,data:result.count}))
      });
      if(!current())return;
      if(counts.total.error)reportFailure('upcoming_count',counts.total.error);else{clearFailure('upcoming_count');setAppointmentsTotalCount(counts.total.data||0);}
      if(counts.today.error)reportFailure('today_count',counts.today.error);else{clearFailure('today_count');setAppointmentsTodayCount(counts.today.data||0);}
      track(Events.DATA_LOAD_TIMING, { operation: 'dashboard_appointments', duration_ms: Math.round(performance.now() - started), result_count: data?.length || 0 });
    } catch(error){
      if(!current())return;
      reportFailure('appointments',controller.signal.aborted?controller.signal.reason:error);
    } finally {
      clearTimeout(timeout);
      if(current())setAppointmentsLoading(false);
    }
  }, [user?.id, clearFailure, reportFailure]);

  const fetchNoShowStats = useCallback(async () => {
    const account=user?.id,ticket=++requests.current.noShow;
    const current=()=>owner.current===account&&requests.current.noShow===ticket;
    clearFailure('noShow');
    if (!user?.id) return;
    controllers.current.noShow?.abort();const controller=new AbortController();controllers.current.noShow=controller;
    const timeout=setTimeout(()=>controller.abort(new DOMException('request_timeout','TimeoutError')),15000);
    const started = performance.now();
    setNoShowLoading(true);
    try {
      const nowIso = new Date().toISOString();
      const sinceIso = new Date(Date.now() - noShowPeriodDays * 24 * 60 * 60 * 1000).toISOString();

      const countByStatus = async (statuses) => {
        const { count, error } = await supabase
          .from('appointments')
          .select('id', { count: 'exact', head: true })
          .abortSignal(controller.signal)
          .eq('nutritionist_id', user.id)
          .gte('start_time', sinceIso)
          .lte('start_time', nowIso)
          .in('status', statuses);
        if (error) throw error;
        return count || 0;
      };
      const counts=await settleResources({
        noShow:()=>countByStatus(['no_show']),
        completed:()=>countByStatus(['completed']),
        canceled:()=>countByStatus(['canceled','cancelled']),
      });
      if(!current())return;
      if(counts.noShow.error)throw counts.noShow.error;
      if(counts.completed.error)throw counts.completed.error;
      if(counts.canceled.error)reportFailure('canceled_count',counts.canceled.error);else clearFailure('canceled_count');
      const noShowCount=counts.noShow.data,completedCount=counts.completed.data,canceledCount=counts.canceled.error?'—':counts.canceled.data;
      const eligibleCount = noShowCount + completedCount;
      const noShowRate = eligibleCount > 0 ? Math.round((noShowCount / eligibleCount) * 100) : 0;

      if(!current())return;
      setNoShowStats({
        noShowCount,
        completedCount,
        canceledCount,
        eligibleCount,
        noShowRate
      });
      track(Events.DATA_LOAD_TIMING, { operation: 'dashboard_no_show', duration_ms: Math.round(performance.now() - started), result_count: noShowCount + completedCount + (typeof canceledCount==='number'?canceledCount:0) });
    } catch(error){
      if(!current())return;
      reportFailure('noShow',controller.signal.aborted?controller.signal.reason:error);
    } finally {
      clearTimeout(timeout);
      if(current())setNoShowLoading(false);
    }
  }, [user?.id, noShowPeriodDays, clearFailure, reportFailure]);

  useEffect(()=>{if(user?.id)fetchStats();},[user?.id,fetchStats]);
  useEffect(()=>{if(user?.id)fetchAppointments();},[user?.id,fetchAppointments]);
  useEffect(()=>{if(user?.id)fetchNoShowStats();},[user?.id,fetchNoShowStats]);
  const retry=()=>{fetchStats();fetchAppointments();fetchNoShowStats();};

  return {
    failures, retry,
    patients:dataOwner===user?.id?patients:[],
    appointments:dataOwner===user?.id?appointments:[],
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
