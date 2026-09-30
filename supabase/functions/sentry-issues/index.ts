// Deprecated alias retained temporarily so old clients fail closed.
Deno.serve(() => new Response(
  JSON.stringify({ error: 'Deprecated endpoint. Use sentry-proxy.' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
));

