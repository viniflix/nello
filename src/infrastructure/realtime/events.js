import { advanceAccessEpoch } from './accessEpochState';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { nextReadSignal } from './readSignalState';
const listeners = new Map();
const allowed = new Set(['chat', 'notifications', 'presence', 'profile', 'clinical', 'access']);
const pending = new Map();
let timer;
function deliver(listener, sequence) {
  try { Promise.resolve(listener({ sequence })).catch(error => logDiagnostic('error', 'realtime/domain-listener', error)); }
  catch (error) { logDiagnostic('error', 'realtime/domain-listener', error); }
}
export function subscribeDomain(userId, kind, callback) {
  const key = `${userId}:${kind}`;
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);
  return () => { const set = listeners.get(key); set?.delete(callback); if (!set?.size) listeners.delete(key); };
}
export function invalidateDomain(userId, kind) {
  if (!userId || !allowed.has(kind)) return;
  const sequence = nextReadSignal();
  if (kind === 'access') {
    advanceAccessEpoch(userId);
    for (const listener of listeners.get(`${userId}:access`) || []) deliver(listener, sequence);
    return;
  }
  pending.set(`${userId}:${kind}`, { userId, kind, sequence });
  timer ??= setTimeout(() => {
    timer = undefined;
    const events = [...pending.values()]; pending.clear();
    const callbacks = new Map();
    for (const event of events) for (const listener of listeners.get(`${event.userId}:${event.kind}`) || []) callbacks.set(listener, Math.max(callbacks.get(listener) || 0, event.sequence));
    callbacks.forEach((sequence, listener) => deliver(listener, sequence));
  }, 100);
}
