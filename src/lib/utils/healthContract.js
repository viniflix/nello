export function validHealth(body, now = Date.now()) {
  const time = Date.parse(body?.checkedAt);
  if (body?.schemaVersion !== 1 || !Number.isFinite(time) || time > now + 10000 || now - time > 60000) return false;
  const states = ['operational', 'unavailable'];
  if (!states.includes(body.checks?.auth) || !states.includes(body.checks?.database) || !states.includes(body.checks?.storage)) return false;
  const available = Object.values(body.checks).filter(state => state === 'operational').length;
  if (Object.keys(body.checks).sort().join(',') !== 'auth,database,storage') return false;
  const expected = available === 3 ? 'operational' : available > 0 ? 'degraded' : 'unavailable';
  return body.status === expected;
}
