import { useCoordinatedLoader } from '@/hooks/useCoordinatedLoader';
import { useResourceSnapshot } from '@/hooks/useResourceSnapshot';
import { useEffect, useCallback, useRef } from 'react';
import { fetchAppointmentsInPeriod } from '@/lib/supabase/agenda-list-queries';
import { agendaPeriod } from '@/lib/agenda/availability';
import { asCivilDate } from '@/lib/utils/date';

export function useAgendaDayAvailability(userId, date, enabled = true) {
  const resource = useResourceSnapshot(JSON.stringify([userId, date, enabled]), []);
  const { begin, succeed, fail } = resource;
  const pending=useRef(null);
  const load = useCoordinatedLoader(useCallback(async () => {
    if (!userId || !date || !enabled) return;
    pending.current?.abort(); const controller=new AbortController(); pending.current=controller;
    const ticket = begin();
    try { asCivilDate(date); } catch (error) {
      fail(ticket, error);
      return;
    }
    const period = agendaPeriod('today', date);
    // Include an earlier booking that can run across midnight (server max:480min).
    await fetchAppointmentsInPeriod(userId, new Date(period.start.getTime() - 480 * 60000), period.end,
      'id,nutritionist_id,appointment_time,start_time,duration,status', 'agenda_availability', {signal:controller.signal})
      .then(rows => { succeed(ticket, rows); })
      .catch(error => { fail(ticket, error); });
  }, [userId, date, enabled, begin, succeed, fail]), resource.scopeKey);
  useEffect(() => { void load(); return()=>pending.current?.abort(); }, [load]);

  return { date, rows: resource.data, resource, status: resource.error ? 'error' : resource.pending ? 'loading' : 'ready', retry: load };
}
