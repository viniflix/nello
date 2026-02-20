import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders } from './cors.ts';
Deno.serve(async (req)=>{
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { userIdToDelete } = await req.json();
    if (!userIdToDelete) {
      throw new Error('User ID to delete is required');
    }
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }
    // Authenticate the caller.
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({
        error: 'Authentication failed'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 401
      });
    }

    const { data: actorProfile, error: actorProfileError } = await supabaseClient.from('user_profiles').select('id, role').eq('id', user.id).single();
    if (actorProfileError || !actorProfile) {
      return new Response(JSON.stringify({
        error: 'Unable to validate caller profile'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }

    const isSelfDelete = user.id === userIdToDelete;
    const isSuperAdmin = actorProfile.role === 'super_admin';
    let isOwnedPatientDelete = false;

    if (actorProfile.role === 'nutritionist' && !isSelfDelete) {
      const { data: link, error: linkError } = await supabaseClient.from('nutritionist_patients').select('id').eq('nutritionist_id', user.id).eq('patient_id', userIdToDelete).limit(1).maybeSingle();
      isOwnedPatientDelete = !linkError && !!link;
    }

    if (!isSelfDelete && !isSuperAdmin && !isOwnedPatientDelete) {
      return new Response(JSON.stringify({
        error: 'Forbidden: insufficient privileges to delete this user'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 403
      });
    }

    // Use service role only after authorization is validated.
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userIdToDelete);
    if (deleteError) {
      throw deleteError;
    }
    return new Response(JSON.stringify({
      message: 'User deleted successfully'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
