import { edgeBoundary } from '../_shared/http.ts';
// Deprecated alias retained temporarily so old clients fail closed.
Deno.serve(edgeBoundary(() => new Response(
  JSON.stringify({ error: 'Deprecated endpoint. Use sentry-proxy.' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
), { retired: true }));
