let epoch = 0;
let owner = null;
const cleanup = new Set();
export const getPrivateSessionEpoch = () => epoch;
export const getPrivateSessionOwner = () => owner;
export const setPrivateSessionOwner = actor => { owner = actor || null; };
export const registerPrivateSessionCleanup = callback => { cleanup.add(callback); return () => cleanup.delete(callback); };
export function invalidatePrivateSession() {
  epoch += 1;
  owner = null;
  for (const callback of cleanup) callback();
}
