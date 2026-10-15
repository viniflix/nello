import { createReadCoordinator } from './readCoordinator';
import { getAccessEpoch } from './accessEpochState';
import { getPrivateSessionEpoch } from '@/lib/utils/privateSessionState';
import { currentReadSignal } from './readSignalState';

const clients = new WeakMap();
const queryStarts = new WeakMap();
export function observeQueryReads(client) {
  if (!client.getQueryCache) return () => {};
  // A pre-existing flight has no observed start. Conservatively reconcile;
  // attachment time cannot prove this read covered an earlier signal.
  for (const query of client.getQueryCache().getAll()) if (query.state.fetchStatus === 'fetching' && !queryStarts.has(query)) queryStarts.set(query, -1);
  return client.getQueryCache().subscribe(event => {
    if (event.type === 'updated' && event.action.type === 'fetch') queryStarts.set(event.query, currentReadSignal());
  });
}
export function invalidateQueryReads(client, filters, actor, sequence) {
  // Lightweight consumers may provide a test adapter; real QueryClient always
  // exposes its cache. Disabled queries remain stale and re-read when enabled.
  if (!client.getQueryCache) return client.invalidateQueries(filters);
  let entries = clients.get(client);
  if (!entries) { entries = new Map(); clients.set(client, entries); }
  if (!entries.unsubscribe) entries.unsubscribe = client.getQueryCache().subscribe(event => {
    if (event.type !== 'removed') return;
    for (const [key, entry] of entries) if (entry.query === event.query) { entry.dispose(); entries.delete(key); }
    if (!entries.size) { entries.unsubscribe?.(); entries.unsubscribe = null; }
  });
  const access = getAccessEpoch(actor), session = getPrivateSessionEpoch();
  const tasks = client.getQueryCache().findAll(filters).map(query => {
    if (sequence !== undefined && queryStarts.get(query) >= sequence && query.state.fetchStatus === 'idle'
      && query.state.dataUpdatedAt > 0 && !query.state.error) return Promise.resolve();
    const key = JSON.stringify([query.queryHash, actor, access, session]);
    void client.invalidateQueries({ queryKey: query.queryKey, exact: true, refetchType: 'none' });
    if (!query.isActive() || query.isDisabled()) return Promise.resolve();
    let entry = entries.get(key);
    const newlyTracked = !entry;
    if (!entry) {
      entry = createReadCoordinator(() => access === getAccessEpoch(actor) && session === getPrivateSessionEpoch()
        && client.getQueryCache().get(query.queryHash) === query && query.isActive() && !query.isDisabled(), 100, currentReadSignal);
      entries.set(key, entry);
      entry.query = query;
    }
    const pending = query.state.fetchStatus === 'fetching';
    const task = entry.request(() => client.refetchQueries({ queryKey: query.queryKey, exact: true, type: 'active' }, { cancelRefetch: false }), [], false, sequence);
    if (pending && newlyTracked && (sequence === undefined || queryStarts.get(query) === undefined || queryStarts.get(query) < sequence)) entry.request(() => client.refetchQueries({ queryKey: query.queryKey, exact: true, type: 'active' }, { cancelRefetch: false }));
    return task.finally(() => {
      if (entries.get(key) === entry && entry.isIdle()) { entry.dispose(); entries.delete(key); }
      if (!entries.size) { entries.unsubscribe?.(); entries.unsubscribe = null; }
    });
  });
  if (!entries.size) { entries.unsubscribe?.(); entries.unsubscribe = null; }
  return Promise.all(tasks);
}
