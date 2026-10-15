import { useCoordinatedLoader } from '@/hooks/useCoordinatedLoader';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getClinicSettings } from '@/lib/supabase/profile-queries';
import { getServices } from '@/lib/supabase/financial-queries';
import { searchAgendaPatients } from '@/lib/supabase/agenda-reference-queries';
import { readAgendaSettings } from '@/lib/agenda/availability';

export function useAgendaReferences(userId) {
  const [state, setState] = useState({ owner: null, patients: [], services: [], settings: null, errors: {}, loading: true });
  const sequence = useRef(0), owner = useRef(userId), pending=useRef(null);
  owner.current = userId;
  const reload = useCoordinatedLoader(useCallback(async () => {
    if (!userId) return;
    const request = ++sequence.current;
    pending.current?.abort();const controller=new AbortController();pending.current=controller;
    const options={signal:controller.signal};
    setState(previous => ({ ...previous, loading: true }));
    const results = await Promise.allSettled([searchAgendaPatients(userId,undefined,undefined,undefined,options), getServices(userId,options), getClinicSettings(userId,options)]);
    if (owner.current !== userId || request !== sequence.current) return;
    const [patients, services, config] = results;
    const schedule = config.status === 'fulfilled' ? readAgendaSettings(config.value) : null;
    setState({ owner: userId,
      patients: patients.status === 'fulfilled' ? patients.value.patients : [],
      services: services.status === 'fulfilled' ? services.value || [] : [],
      settings: schedule && !schedule.errors.length ? schedule.settings : null,
      errors: { patients: patients.status === 'rejected', services: services.status === 'rejected', settings: !schedule || schedule.errors.length > 0 }, loading: false });
  }, [userId]), JSON.stringify([userId, 'agenda.references']), ['clinical','profile']);
  useEffect(() => {
    void reload();
    return () => { sequence.current += 1; pending.current?.abort(); };
  }, [userId, reload]);
  const searchPatients = useCallback(async (query, offset = 0, patientId = null, options = {}) => {
    const response = await searchAgendaPatients(userId, query, offset, patientId, options);
    return owner.current === userId ? response : { patients: [], hasMore: false };
  }, [userId]);
  return state.owner === userId ? { ...state, reload, searchPatients } : { patients: [], services: [], settings: null, errors: {}, loading: true, reload, searchPatients };
}
