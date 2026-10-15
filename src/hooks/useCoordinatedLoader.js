import { useCallback, useEffect, useRef } from 'react';
import { createReadCoordinator } from '@/infrastructure/realtime/readCoordinator';
import { subscribeDomain } from '@/infrastructure/realtime/events';
import { getAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { getPrivateSessionEpoch } from '@/lib/utils/privateSessionState';
import { useAccessEpoch, resourceActor } from './useAccessEpoch';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { currentReadSignal } from '@/infrastructure/realtime/readSignalState';

// Scope is the same owner/projection key already used by the snapshot. Reads
// keep their existing DTO/error/presentation guards. Durable writes stay outside.
export function useCoordinatedLoader(loader, scope, domains = ['clinical']) {
  const actor = resourceActor(scope), accessEpoch = useAccessEpoch(actor);
  const domainKey = domains.join(',');
  const source = useRef(loader), scopeRef = useRef(scope), active = useRef(true), state = useRef(null);
  source.current = loader; scopeRef.current = scope;
  const getReader = useCallback(() => {
    if (!active.current || scopeRef.current !== scope) return { request: () => Promise.resolve() };
    const access = getAccessEpoch(actor), session = getPrivateSessionEpoch();
    const key = JSON.stringify([scope, access, session]);
    if (state.current?.key !== key) {
      state.current?.reader.dispose();
      state.current = { key, reader: createReadCoordinator(() => active.current && scopeRef.current === scope
        && access === getAccessEpoch(actor) && session === getPrivateSessionEpoch(), 100, currentReadSignal) };
    }
    return state.current.reader;
  }, [actor, scope]);
  const load = useCallback((...args) => getReader().request((...values) => source.current(...values), args), [getReader, loader, accessEpoch]);
  const invalidate = useCallback(() => getReader().request(() => source.current(), [], true), [getReader]);
  load.invalidate = invalidate;
  useEffect(() => {
    active.current = true;
    const refresh = signal => {
      const work = getReader().request(() => source.current(), [], false, signal?.sequence);
      void work.catch(error => logDiagnostic('error', 'realtime/manual-read', error));
      return work;
    };
    const off = domainKey.split(',').filter(Boolean).map(domain => subscribeDomain(actor, domain, refresh));
    return () => { off.forEach(fn => fn()); active.current = false; state.current?.reader.dispose(); state.current = null; };
  }, [actor, scope, domainKey, getReader]);
  return load;
}
