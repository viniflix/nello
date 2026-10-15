import { useCoordinatedLoader } from '@/hooks/useCoordinatedLoader';
import { useCallback, useEffect, useRef } from 'react';
import { useResourceSnapshot } from '@/hooks/useResourceSnapshot';
import { useAdminAccess } from './useAdminAccess';

// Manual exceptions use the same owner/snapshot contract as E03/E04. A source
// success never changes the gate's authorization decision.
export function useAdminManualResource(key, loader, initialData = null) {
  const access = useAdminAccess();
  const resource = useResourceSnapshot(JSON.stringify([access.userId || null, key]), initialData);
  const { begin, succeed, fail, cancel } = resource;
  const generation = useRef(0);
  const inFlight = useRef(null);
  const load = useCoordinatedLoader(useCallback(async () => {
    if (!access.canAct()) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const ticket = begin();
    const request = ++generation.current;
    try {
      const { data, error } = await loader({ signal: controller.signal });
      if (error) throw error;
      if (data == null) throw new Error('admin_source_missing');
      if (!controller.signal.aborted && request === generation.current && access.canAct()) succeed(ticket, data);
    } catch (error) { if (request === generation.current && access.canAct()) fail(ticket, error); }
    return ticket;
  }, [begin, succeed, fail, loader, access.canAct]), resource.scopeKey, ['clinical']);
  useEffect(() => {
    if (access.phase !== 'authorized') return;
    let ticket;
    void load().then(value => { ticket = value; });
    return () => { generation.current += 1; inFlight.current?.abort(); if (ticket) cancel(ticket); };
  }, [load, cancel, access.phase]);
  return { ...resource, load };
}
