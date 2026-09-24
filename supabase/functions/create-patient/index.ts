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
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonResponse(400, { error: 'Invalid patient request' });
  }

  const { email, metadata, defaultPassword, isOffline, requestId } = body;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return jsonResponse(400, { error: 'Invalid patient metadata' });
  }

  // Validation depends on whether it's an offline creation or standard invite
  if (!isOffline && (!email || !metadata || !defaultPassword)) {
    return jsonResponse(400, {
      error: "Missing required fields for invitation: email, metadata, or defaultPassword",
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

  const { data: adminAccess } = await supabaseAuth.rpc('admin_access_status');
  const isAdmin = adminAccess?.authorized === true;
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
  if (typeof normalizedMetadata.name !== 'string' || !normalizedMetadata.name.trim()) {
    return jsonResponse(400, { error: 'patient_name_required' });
  }
  const normalizedEmail = typeof email === 'string' ? validateLength(email.trim().toLowerCase(), 100) : null;
  if (!isOffline && (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) {
    return jsonResponse(400, { error: 'invalid_patient_email' });
  }
  if (normalizedMetadata.phone) normalizedMetadata.phone = validateLength(normalizedMetadata.phone, 20);
  if (normalizedMetadata.cpf) normalizedMetadata.cpf = validateLength(normalizedMetadata.cpf, 14);
  if (normalizedMetadata.occupation) normalizedMetadata.occupation = validateLength(normalizedMetadata.occupation, 100);
  if (normalizedMetadata.observations) normalizedMetadata.observations = validateLength(normalizedMetadata.observations, 1000);

  if (isOffline) {
    const operationId = typeof requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
      ? requestId : crypto.randomUUID();
    const { data, error } = await supabaseAdmin.rpc('create_offline_patient_atomic', {
      p_request_id: operationId,
      p_nutritionist_id: normalizedMetadata.nutritionist_id,
      p_patient_id: crypto.randomUUID(),
      p_invite_code: generateSecureInviteCode(),
      p_email: normalizedEmail,
      p_profile: normalizedMetadata,
    });
    if (error) {
      console.error('Offline patient transaction failed', { code: error.code });
      return jsonResponse(500, { error: 'offline_patient_creation_failed', code: error.code });
    }
    return jsonResponse(200, data);
  }

  // STANDARD FLOW: Invite via email
  if (typeof defaultPassword !== "string" || defaultPassword.length < 6) {
    return jsonResponse(400, { error: "defaultPassword must be at least 6 characters (format: DDMMAA)" });
  }
  normalizedMetadata.needs_password_reset = true;

  const { data: userData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    normalizedEmail!,
    {
      data: normalizedMetadata,
      redirectTo: "https://nellonutri.com.br/update-password?mode=invite",
    }
  );

  if (inviteError || !userData?.user?.id) {
    console.error('Supabase Invite Error', { status: inviteError?.status });
    return jsonResponse(502, { error: 'patient_invite_failed' });
  }

  // Update newly invited user to set their default password so they can log in via email+senha
  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
    userData.user.id,
    { password: defaultPassword }
  );

  if (passwordError) {
    console.error('Supabase Set Password Error', { status: passwordError.status });
    const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
    if (rollbackError) {
      console.error('Invited account requires operational recovery', { status: rollbackError.status });
      return jsonResponse(503, { error: 'patient_invite_recovery_required' });
    }
    return jsonResponse(502, { error: 'patient_invite_not_completed' });
  }

  return jsonResponse(200, { userId: userData.user.id });
});
