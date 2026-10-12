import { useEffect, useState } from 'react';
import { fetchAppointmentsInPeriod } from '@/lib/supabase/agenda-list-queries';
import { agendaPeriod } from '@/lib/agenda/availability';
import { subscribeDomain } from '@/infrastructure/realtime/events';
import { asCivilDate } from '@/lib/utils/date';

export function useAgendaDayAvailability(userId, date, enabled = true) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ owner: null, date: null, rows: [], status: 'loading' });
  useEffect(() => subscribeDomain(userId, 'clinical', () => setRevision(value => value + 1)), [userId]);
  useEffect(() => {
    if (!userId || !date || !enabled) return;
    try { asCivilDate(date); } catch {
      setState({ owner: userId, date, rows: [], status: 'error' });
      return;
    }
    let active = true;
    setState({ owner: userId, date, rows: [], status: 'loading' });
    const period = agendaPeriod('today', date);
    // Include an earlier booking that can run across midnight (server max:480min).
    fetchAppointmentsInPeriod(userId, new Date(period.start.getTime() - 480 * 60000), period.end,
      'id,nutritionist_id,appointment_time,start_time,duration,status', 'agenda_availability')
      .then(rows => { if (active) setState({ owner: userId, date, rows, status: 'ready' }); })
      .catch(() => { if (active) setState({ owner: userId, date, rows: [], status: 'error' }); });
    return () => { active = false; };
  }, [userId, date, enabled, revision]);
  return { ...(state.owner === userId && state.date === date ? state : { date, rows: [], status: 'loading' }), retry: () => setRevision(value => value + 1) };
}
