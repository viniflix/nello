// Holds only in-flight work, never a persistent cache or mutation queue.
export function createReadCoordinator(isCurrent = () => true, delay = 100, getSequence = () => 0) {
  let flight, timer, waiting, resolveWaiting, rejectWaiting, dirty = false, reader, args = [], disposed = false;
  const valid = () => !disposed && isCurrent();
  let startedSequence = -1;
  const start = () => {
    if (!valid()) return Promise.resolve();
    let resolve, reject;
    flight = new Promise((yes, no) => { resolve = yes; reject = no; });
    const result = flight;
    (async () => {
      let value, failure;
      do {
        dirty = false;
        startedSequence = getSequence();
        try { value = await reader(...args); failure = null; } catch (error) { failure = error; }
      } while (dirty && valid());
      flight = undefined;
      if (!valid()) resolve(); else if (failure) reject(failure); else resolve(value);
    })();
    return result;
  };
  const request = (fn, values = [], invalidate = false, sequence) => {
    if (!valid()) return Promise.resolve();
    reader = fn; args = values;
    if (flight) { if (sequence === undefined || sequence > startedSequence) dirty = true; return flight; }
    if (sequence !== undefined && sequence <= startedSequence) return Promise.resolve();
    if (!invalidate) {
      clearTimeout(timer); timer = undefined;
      const result = start();
      if (waiting) { result.then(resolveWaiting, rejectWaiting); waiting = undefined; }
      return result;
    }
    if (!waiting) waiting = new Promise((yes, no) => { resolveWaiting = yes; rejectWaiting = no; });
    timer ??= setTimeout(() => {
      timer = undefined;
      const resolve = resolveWaiting, reject = rejectWaiting; waiting = undefined;
      start().then(resolve, reject);
    }, delay);
    return waiting;
  };
  return { request, isIdle: () => !flight && !timer && !waiting, dispose() { disposed = true; dirty = false; clearTimeout(timer); timer = undefined; resolveWaiting?.(); waiting = undefined; } };
}
