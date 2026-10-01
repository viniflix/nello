import { inspectHealth } from '../operations/availability/health.mjs';
import { publicIncidents } from '../operations/availability/incidents.mjs';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).end(JSON.stringify({ error: 'method_not_allowed' }));
  }
  const health = await inspectHealth();
  return response.status(health.status === 'operational' ? 200 : 503)
    .end(request.method === 'HEAD' ? undefined : JSON.stringify({ ...health, incidents: publicIncidents() }));
}
