// supabase/functions/create-patient/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const getAllowedOrigins = (): string[] => {
  const origins = Deno.env.get("ALLOWED_ORIGINS") ?? "";
  return origins
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const resolveCorsOrigin = (origin: string | null): string => {
  const allowed = getAllowedOrigins();
  if (!origin) return allowed[0] ?? "*";
  if (allowed.length === 0) return "*";
  return allowed.includes(origin) ? origin : allowed[0];
};

const buildCorsHeaders = (origin: string | null) => ({
  "Access-Control-Allow-Origin": resolveCorsOrigin(origin),
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});

serve(async (req)=>{
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));

  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "Method Not Allowed"
    }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({
      error: "Missing authorization header",
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    },
  );

  const { data: authData } = await supabaseClient.auth.getUser();
  if (!authData?.user) {
    return new Response(JSON.stringify({
      error: "Authentication failed",
    }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }

  const { data: callerProfile, error: profileError } = await supabaseClient
    .from("user_profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !callerProfile) {
    return new Response(JSON.stringify({
      error: "Unable to validate caller profile",
    }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }

  const isAllowedRole =
    callerProfile.role === "nutritionist" || callerProfile.role === "super_admin";

  if (!isAllowedRole) {
    return new Response(JSON.stringify({
      error: "Forbidden: only nutritionists or admins can invite patients",
    }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({
      error: "Invalid JSON body"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  // MUDANÇA: Agora também pegamos 'redirectTo' do corpo
  const { email, metadata, redirectTo } = body;
  if (!email || !metadata || !redirectTo) {
    return new Response(JSON.stringify({
      error: "Missing required fields: email, metadata, or redirectTo"
    }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: {
      persistSession: false
    }
  });

  const { data: userData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo: redirectTo
  });
  if (inviteError) {
    console.error("Supabase Invite Error:", inviteError);
    return new Response(JSON.stringify({
      error: inviteError.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
  return new Response(JSON.stringify({
    userId: userData.user.id
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });
});
