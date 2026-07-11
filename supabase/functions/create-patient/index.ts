import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

// Helper to generate a secure 8-character alphanumeric invite code (XXXX-XXXX)
const generateSecureInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded similar looking chars like I, 1, O, 0
  const getRandomString = (length: number) => {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => chars[byte % chars.length]).join('');
  };
  return `${getRandomString(4)}-${getRandomString(4)}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method Not Allowed" });
  }

  let body;
  try {
    body = await req.json();
  } catch (_e) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const { email, metadata, redirectTo, defaultPassword, isOffline } = body;
  
  // Validation depends on whether it's an offline creation or standard invite
  if (!isOffline && (!email || !metadata || !redirectTo || !defaultPassword)) {
    return jsonResponse(400, {
      error: "Missing required fields for invitation: email, metadata, redirectTo, or defaultPassword",
    });
  }

  if (isOffline && !metadata) {
    return jsonResponse(400, { error: "Missing metadata for offline patient creation" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse(500, { error: "Supabase environment variables missing" });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return jsonResponse(401, { error: "Missing Authorization header" });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
  const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser();
  const caller = authData?.user;
  if (authError || !caller) {
    return jsonResponse(401, { error: "Invalid or expired token" });
  }

  const { data: callerProfile, error: callerProfileError } = await supabaseAdmin
    .from("user_profiles")
    .select("user_type, is_admin")
    .eq("id", caller.id)
    .single();

  if (callerProfileError || !callerProfile) {
    return jsonResponse(403, { error: "Caller profile not authorized" });
  }

  const isAdmin = callerProfile.is_admin === true;
  const isNutritionist = callerProfile.user_type === "nutritionist";
  if (!isAdmin && !isNutritionist) {
    return jsonResponse(403, { error: "Insufficient permissions" });
  }

  const normalizedMetadata = { ...metadata };
  normalizedMetadata.user_type = normalizedMetadata.user_type || "patient";
  if (normalizedMetadata.user_type !== "patient") {
    return jsonResponse(400, { error: "Only patient invites are allowed" });
  }
  normalizedMetadata.nutritionist_id = normalizedMetadata.nutritionist_id || caller.id;
  if (normalizedMetadata.nutritionist_id !== caller.id && !isAdmin) {
    return jsonResponse(403, { error: "nutritionist_id mismatch" });
  }

  // Backend Validation for character limits
  const validateLength = (val: string | null, max: number) => {
    if (val && val.length > max) return val.slice(0, max);
    return val;
  };

  if (normalizedMetadata.name) normalizedMetadata.name = validateLength(normalizedMetadata.name, 100);
  if (email) body.email = validateLength(email, 100);
  if (normalizedMetadata.phone) normalizedMetadata.phone = validateLength(normalizedMetadata.phone, 20);
  if (normalizedMetadata.cpf) normalizedMetadata.cpf = validateLength(normalizedMetadata.cpf, 14);
  if (normalizedMetadata.occupation) normalizedMetadata.occupation = validateLength(normalizedMetadata.occupation, 100);
  if (normalizedMetadata.observations) normalizedMetadata.observations = validateLength(normalizedMetadata.observations, 1000);

  if (isOffline) {
    // OFFLINE FLOW: Direct insertion into user_profiles
    const offlineProfileId = crypto.randomUUID();
    
    const patientInviteCode = generateSecureInviteCode();
    
    // Include ALL fields from metadata that should go into user_profiles
    const { error: insertError } = await supabaseAdmin
      .from("user_profiles")
      .insert({
        id: offlineProfileId,
        name: normalizedMetadata.name,
        full_name: normalizedMetadata.name,
        email: email || null,
        birth_date: normalizedMetadata.birth_date || null,
        user_type: "patient",
        nutritionist_id: normalizedMetadata.nutritionist_id,
        patient_invite_code: patientInviteCode,
        is_active: true,
        phone: normalizedMetadata.phone || null,
        cpf: normalizedMetadata.cpf || null,
        gender: normalizedMetadata.gender || null,
        occupation: normalizedMetadata.occupation || null,
        civil_status: normalizedMetadata.civil_status || null,
        observations: normalizedMetadata.observations || null,
        address: normalizedMetadata.address || null,
        needs_password_reset: true
      });

    if (insertError) {
      console.error("Offline Patient Insertion Error:", insertError);
      return jsonResponse(500, { error: insertError.message });
    }

    // Link the patient to the nutritionist in nutritionist_patients
    await supabaseAdmin
      .from("nutritionist_patients")
      .insert({
        nutritionist_id: normalizedMetadata.nutritionist_id,
        patient_id: offlineProfileId,
        status: 'active'
      });

    return jsonResponse(200, { userId: offlineProfileId, inviteCode: patientInviteCode });
  }

  // STANDARD FLOW: Invite via email
  if (typeof defaultPassword !== "string" || defaultPassword.length < 6) {
    return jsonResponse(400, { error: "defaultPassword must be at least 6 characters (format: DDMMAA)" });
  }
  normalizedMetadata.needs_password_reset = true;

  const { data: userData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    {
      data: normalizedMetadata,
      redirectTo: redirectTo,
    }
  );

  if (inviteError) {
    console.error("Supabase Invite Error:", inviteError);
    return jsonResponse(500, { error: inviteError.message });
  }

  // Update newly invited user to set their default password so they can log in via email+senha
  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
    userData.user.id,
    { password: defaultPassword }
  );

  if (passwordError) {
    console.error("Supabase Set Password Error:", passwordError);
  }

  return jsonResponse(200, { userId: userData.user.id });
});
