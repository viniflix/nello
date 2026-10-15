const epochs = new Map(), listeners = new Map();
export const getAccessEpoch = actor => epochs.get(actor) || 0;
export function subscribeAccessEpoch(actor, callback) {
  if (!actor) return () => {};
  if (!listeners.has(actor)) listeners.set(actor, new Set());
  listeners.get(actor).add(callback);
  return () => { listeners.get(actor)?.delete(callback); if (!listeners.get(actor)?.size) listeners.delete(actor); };
}
export function advanceAccessEpoch(actor) {
  epochs.set(actor, getAccessEpoch(actor) + 1);
  for (const listener of listeners.get(actor) || []) listener();
}
