import { useCallback, useEffect, useRef, useState } from 'react';
import { failurePresentation } from '@/lib/utils/failure';
import { useAccessEpoch, resourceActor } from './useAccessEpoch';
import { getAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { getPrivateSessionEpoch } from '@/lib/utils/privateSessionState';

// A confirmed empty dataset is still a snapshot. Never reuse it for another key.
export function useResourceSnapshot(key, initialData = null) {
  const actor = resourceActor(key), accessEpoch = useAccessEpoch(actor);
  const accessScope = useRef(accessEpoch);
  const scope = useRef(key);
  const epoch = useRef(0);
  const scopeGeneration = useRef(0);
  const initial = useRef(initialData);
  initial.current = initialData;
  if (scope.current !== key) { scope.current = key; epoch.current += 1; scopeGeneration.current += 1; }
  if (accessScope.current !== accessEpoch) { accessScope.current = accessEpoch; epoch.current += 1; scopeGeneration.current += 1; }
  const [state, setState] = useState({ key, generation: scopeGeneration.current, data: initialData, confirmed: false, pending: true, error: null, confirmedAt: null });
  useEffect(() => () => { epoch.current += 1; }, []);
  const current = useCallback(ticket => ticket.key === scope.current && ticket.epoch === epoch.current
    && ticket.access === getAccessEpoch(resourceActor(ticket.key)) && ticket.session === getPrivateSessionEpoch(), []);
  const begin = useCallback(() => {
    const ticket = { key: scope.current, epoch: ++epoch.current, generation: scopeGeneration.current,
      access: getAccessEpoch(resourceActor(scope.current)), session: getPrivateSessionEpoch() };
    setState(previous => previous.key === ticket.key && previous.generation === ticket.generation
      ? { ...previous, pending: true, error: null }
      : { key: ticket.key, generation: ticket.generation, data: initial.current, confirmed: false, pending: true, error: null, confirmedAt: null });
    return ticket;
  }, [accessEpoch]);
  const succeed = useCallback((ticket, data) => {
    if (!current(ticket)) return false;
    setState({ key: ticket.key, generation: ticket.generation, data, confirmed: true, pending: false, error: null, confirmedAt: Date.now() });
    return true;
  }, [current]);
  const fail = useCallback((ticket, error) => {
    if (!current(ticket)) return false;
    const failure = failurePresentation(error);
    if (failure.kind === 'aborted') return false;
    const denied = ['forbidden', 'unauthenticated'].includes(failure.kind);
    setState(previous => ({ ...previous, key: ticket.key, pending: false, error: failure,
      ...(denied ? { data: initial.current, confirmed: false, confirmedAt: null } : {}) }));
    return true;
  }, [current]);
  const invalidate = useCallback(() => {
    epoch.current += 1;
    setState({ key: scope.current, generation: scopeGeneration.current, data: initial.current, confirmed: false, pending: true, error: null, confirmedAt: null });
  }, []);
  const cancel = useCallback(ticket => { if (current(ticket)) epoch.current += 1; }, [current]);
  const visible = state.key === key && state.generation === scopeGeneration.current ? state : { data: initialData, confirmed: false, pending: true, error: null, confirmedAt: null };
  return { scopeKey: key, data: visible.data, hasSnapshot: visible.confirmed, initialLoading: visible.pending && !visible.confirmed,
    refreshing: visible.pending && visible.confirmed, pending: visible.pending, error: visible.error,
    stale: visible.confirmed && Boolean(visible.error), confirmedAt: visible.confirmedAt,
    canAct: visible.confirmed && !visible.pending && !visible.error, begin, succeed, fail, invalidate, cancel, current };
}
