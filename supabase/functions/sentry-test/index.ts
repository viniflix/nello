// Disabled diagnostic endpoint retained temporarily so the public URL fails closed.
Deno.serve(() => new Response(
  JSON.stringify({ error: 'Diagnostic endpoint disabled.' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
));

