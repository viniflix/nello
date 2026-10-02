const listeners = new Map();
const allowed = new Set(['chat', 'notifications', 'presence', 'profile', 'clinical', 'access']);
const pending = new Map();
let timer;
export function subscribeDomain(userId, kind, callback) {
  const key = `${userId}:${kind}`;
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(callback);
  return () => { const set = listeners.get(key); set?.delete(callback); if (!set?.size) listeners.delete(key); };
}
export function invalidateDomain(userId, kind) {
  if (!userId || !allowed.has(kind)) return;
  pending.set(`${userId}:${kind}`, { userId, kind });
  timer ??= setTimeout(() => {
    timer = undefined;
    const events = [...pending.values()]; pending.clear();
    for (const event of events) for (const listener of listeners.get(`${event.userId}:${event.kind}`) || []) listener();
  }, 100);
}
