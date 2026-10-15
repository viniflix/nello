import { queryClient } from '@/app/config/queryClient';
import { getPrivateSessionEpoch, getPrivateSessionOwner, registerPrivateSessionCleanup } from './privateSessionState';
import { getAccessEpoch, subscribeAccessEpoch } from '@/infrastructure/realtime/accessEpochState';
import { readCancellation } from './readPolicy';
import { classifyFailure } from './failure';

// Projection versions identify DTO contracts, not a claim that server data never changes.
export const referenceDefinitions = Object.freeze({
  household: { public: true, result: true, source: 'household_measures', projection: 'active-full-v1' },
  customActive: { family: 'custom', result: true, source: 'nutritionist_custom_measures', projection: 'active-full-v1' },
  customAll: { family: 'custom', result: true, source: 'nutritionist_custom_measures', projection: 'all-full-v1' },
  food: { source: 'food_measures', projection: 'food-aliases-v1' },
  foodLegacy: { family: 'food', result: true, source: 'food_household_measures', projection: 'joined-v1' },
  clinic: { source: 'user_profiles', projection: 'clinic-preferences-v1' },
  services: { source: 'services', projection: 'active-revision-v1' },
});
export function referenceScope(owner) {
  return { actor: getPrivateSessionOwner() || owner || null, session: getPrivateSessionEpoch(), access: getAccessEpoch(getPrivateSessionOwner() || owner) };
}
export function referenceKey(name, owner = null, id = null, scope = referenceScope(owner)) {
  const def = referenceDefinitions[name];
  return ['nello-reference', def.public ? 'public' : 'private', def.public ? null : scope.actor,
    def.public ? 0 : scope.session, def.public ? 0 : scope.access,
    def.family || name, owner, def.source, def.projection, id];
}
export const unwrapReference = result => {
  if (result?.error) throw result.error;
  return result && !Array.isArray(result) && Object.hasOwn(result, 'data') ? result.data : result;
};
export function referenceOptions(name, owner, id, load, scope = referenceScope(owner)) {
  const def = referenceDefinitions[name];
  return {
    queryKey: referenceKey(name, owner, id, scope),
    staleTime: def.public ? 300000 : 30000,
    gcTime: def.public ? 300000 : 60000,
    retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    structuralSharing: false,
    queryFn: async ({ signal }) => {
      const current = () => def.public || (scope.session === getPrivateSessionEpoch()
        && scope.access === getAccessEpoch(scope.actor)
        && (!getPrivateSessionOwner() || getPrivateSessionOwner() === scope.actor));
      if (!current() || signal.aborted) throw readCancellation(signal);
      const loaded = await load(signal);
      const data = def.result ? unwrapReference(loaded) : loaded;
      if (!current() || signal.aborted) throw readCancellation(signal);
      return data;
    },
  };
}
// A caller may stop waiting without cancelling the flight needed by other consumers.
function waitForCaller(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(readCancellation(signal)); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
export function readReference(name, owner, id, load, options = {}) {
  const def = referenceDefinitions[name];
  if (options.cache === false || (!def.public && !referenceScope(owner).actor)) return load(options.signal).then(value => def.result ? unwrapReference(value) : value);
  const config = referenceOptions(name, owner, id, load);
  if (options.force) void queryClient.invalidateQueries({ queryKey: config.queryKey, exact: true, refetchType: 'none' });
  if (options.signal?.aborted) return Promise.reject(readCancellation(options.signal));
  return waitForCaller(queryClient.fetchQuery(config), options.signal);
}
export function invalidateReference(family, owner, { id, source, scope = referenceScope(owner) } = {}) {
  const filters = { predicate: query => {
    const k = query.queryKey;
    return k[0] === 'nello-reference' && k[1] === 'private' && k[2] === scope.actor
      && k[3] === scope.session && k[5] === family && (owner == null || k[6] === owner)
      && (id == null || k[9] === id) && (!source || k[7] === source);
  } };
  // Cancellation prevents a pre-write response from restoring the invalidated snapshot.
  void queryClient.cancelQueries(filters);
  return queryClient.invalidateQueries(filters);
}
registerPrivateSessionCleanup(() => {
  const filters = { predicate: q => q.queryKey[0] === 'nello-reference' && q.queryKey[1] === 'private' };
  void queryClient.cancelQueries(filters);
  queryClient.removeQueries(filters);
});

// One access listener per cached actor, released when its last entry is removed.
const accessSubscriptions = new Map();
queryClient.getQueryCache().subscribe(({ type, query, action }) => {
  const k = query.queryKey;
  if (k[0] !== 'nello-reference' || k[1] !== 'private' || !k[2]) return;
  const actor = k[2];
  if (type === 'updated' && action?.type === 'error'
    && ['unauthenticated', 'forbidden'].includes(classifyFailure(query.state.error))) {
    // fetchQuery must not return a previously fresh private value after denial.
    query.setState({data:undefined, dataUpdatedAt:0});
  }
  if (type === 'added' && !accessSubscriptions.has(actor)) {
    accessSubscriptions.set(actor, subscribeAccessEpoch(actor, () => {
      const filters = { predicate: q => q.queryKey[0] === 'nello-reference' && q.queryKey[1] === 'private'
        && q.queryKey[2] === actor && q.queryKey[4] !== getAccessEpoch(actor) };
      void queryClient.cancelQueries(filters);
      queryClient.removeQueries(filters);
    }));
  }
  if (type === 'removed' && !queryClient.getQueryCache().findAll({ predicate: q => q.queryKey[0] === 'nello-reference'
    && q.queryKey[1] === 'private' && q.queryKey[2] === actor }).length) {
    accessSubscriptions.get(actor)?.(); accessSubscriptions.delete(actor);
  }
});
