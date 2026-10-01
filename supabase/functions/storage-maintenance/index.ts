import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { edgeBoundary, RequestError, timedFetch } from '../_shared/http.ts';
import { cleanExpiredUploads, cleanApprovedErasures } from '../upload-private-file/cleanup.ts';

// Scheduled trusted maintenance only. No caller-selected bucket/path and no
// clinical deletion: the database claims exclusively expired technical orphans.
Deno.serve(edgeBoundary(async (req: Request) => {
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!service || !url) throw new RequestError(503, 'maintenance_unavailable');
  if (req.headers.get('authorization') !== `Bearer ${service}`) throw new RequestError(403, 'trusted_storage_maintenance_required');
  const admin = createClient(url, service, { auth: { persistSession: false }, global: { fetch: timedFetch } });
  const result = await cleanExpiredUploads(admin);
  const erasures = await cleanApprovedErasures(admin);
  return Response.json({ orphans: result, erasures }, { status: result.claimed === result.removed && erasures.claimed === erasures.removed ? 200 : 503 });
}));
