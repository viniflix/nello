// Stable sampling per technical session and operation, without persisting identities.
export function createTimingSampler() {
  const recent = new Map();
  return ({ session, operation, duration, now = Date.now() }) => {
    if (!session || !/^[a-z0-9_.:-]{1,80}$/i.test(operation || '') || !Number.isFinite(duration) || duration < 0) return null;
    for (const [key, at] of recent) if (now - at >= 60000 || now < at) recent.delete(key);
    const key = `${session}:${operation}`;
    let hash = 2166136261;
    for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
    const slow = duration >= 2000;
    if (recent.has(key) || (!slow && hash % 10 !== 0)) return null;
    if (recent.size >= 128) recent.delete(recent.keys().next().value);
    recent.set(key, now);
    return { sample_rate: slow ? 1 : 0.1, sample_type: slow ? 'slow' : 'session_operation' };
  };
}
