import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders, ...(status === 429 ? { 'Retry-After': '600' } : {}) },
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

  if (JSON.stringify(body).length > 65536) return jsonResponse(413, { error: 'patient_request_too_large' });
  const { email, metadata, isOffline, requestId } = body;
  if (typeof isOffline !== 'boolean') return jsonResponse(400, { error: 'invalid_patient_request_mode' });
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return jsonResponse(400, { error: 'Invalid patient metadata' });
  }

  // Validation depends on whether it's an offline creation or standard invite
  if (!isOffline && (!email || !metadata)) {
    return jsonResponse(400, {
      error: "Missing required fields for invitation: email or metadata",
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

  const allowedMetadata = new Set(['name', 'user_type', 'nutritionist_id', 'birth_date', 'gender', 'phone',
    'cpf', 'occupation', 'civil_status', 'observations', 'address']);
  const normalizedMetadata = Object.fromEntries(Object.entries(metadata).filter(([key]) => allowedMetadata.has(key)));
  for (const [key, value] of Object.entries(normalizedMetadata)) {
    if (value != null && key !== 'address' && typeof value !== 'string') {
      return jsonResponse(400, { error: 'invalid_patient_metadata_type' });
    }
  }
  if (normalizedMetadata.address != null) {
    if (typeof normalizedMetadata.address !== 'object' || Array.isArray(normalizedMetadata.address)) {
      return jsonResponse(400, { error: 'invalid_patient_address' });
    }
    const fields = new Set(['cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state']);
    if (Object.values(normalizedMetadata.address).some(value => value != null && typeof value !== 'string')) {
      return jsonResponse(400, { error: 'invalid_patient_address' });
    }
    normalizedMetadata.address = Object.fromEntries(Object.entries(normalizedMetadata.address)
      .filter(([key]) => fields.has(key)).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 200) : null]));
  }
  normalizedMetadata.user_type = normalizedMetadata.user_type || "patient";
  if (normalizedMetadata.user_type !== "patient") {
    return jsonResponse(400, { error: "Only patient invites are allowed" });
  }
  normalizedMetadata.nutritionist_id = normalizedMetadata.nutritionist_id || caller.id;
  if (normalizedMetadata.nutritionist_id !== caller.id && !isAdmin) {
    return jsonResponse(403, { error: "nutritionist_id mismatch" });
  }
  const { data: verification, error: verificationError } = await supabaseAdmin
    .from('professional_verifications').select('status, valid_until')
    .eq('user_id', normalizedMetadata.nutritionist_id).maybeSingle();
  if (verificationError || verification?.status !== 'approved' || !verification.valid_until
    || Date.parse(verification.valid_until) <= Date.now()) {
    return jsonResponse(403, { error: 'professional_verification_required' });
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
  const { data: withinQuota, error: quotaError } = await supabaseAdmin.rpc('consume_patient_creation_quota', { p_actor: caller.id });
  if (quotaError) return jsonResponse(503, { error: 'patient_creation_quota_unavailable' });
  if (withinQuota !== true) return jsonResponse(429, { error: 'patient_creation_rate_limited' });

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
  const birthDate = typeof normalizedMetadata.birth_date === 'string' ? normalizedMetadata.birth_date : '';
  const date = new Date(`${birthDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== birthDate || date.getTime() > Date.now()) {
    return jsonResponse(400, { error: 'valid_birth_date_required' });
  }
  // User-approved accessibility policy: derive this initial credential on the
  // server, never accept an arbitrary password supplied by the requesting UI.
  const defaultPassword = birthDate.slice(8, 10) + birthDate.slice(5, 7) + birthDate.slice(2, 4);
  normalizedMetadata.needs_password_reset = true;

  const { data: nonce, error: authorizationError } = await supabaseAdmin.rpc('prepare_patient_auth_invitation', {
    p_email: normalizedEmail, p_nutritionist: normalizedMetadata.nutritionist_id,
  });
  if (authorizationError || typeof nonce !== 'string') {
    return jsonResponse(authorizationError?.code === '23505' ? 409 : 503,
      { error: authorizationError?.code === '23505' ? 'patient_account_already_exists' : 'patient_invite_authorization_unavailable' });
  }
  normalizedMetadata.nello_provisioning_nonce = nonce;

  const { data: userData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
    normalizedEmail!,
    {
      data: normalizedMetadata,
      redirectTo: "https://nellonutri.com.br/update-password?mode=invite",
    }
  );

  if (inviteError || !userData?.user?.id) {
    console.error('Supabase Invite Error', { status: inviteError?.status });
    return jsonResponse(inviteError?.status === 429 ? 429 : inviteError?.status === 422 ? 409 : 502,
      { error: inviteError?.status === 429 ? 'patient_creation_rate_limited' : inviteError?.status === 422 ? 'patient_account_already_exists' : 'patient_invite_failed' });
  }

  // Update newly invited user to set their default password so they can log in via email+senha
  const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(
    userData.user.id,
    { password: defaultPassword }
  );

  if (passwordError) {
    console.error('Supabase Set Password Error', { status: passwordError.status });
    // The email has already been delivered/queued. Preserve the account and
    // its valid invitation rather than deleting an account with a live link.
    return jsonResponse(200, { userId: userData.user.id, initialPasswordAvailable: false, invitationSent: true });
  }

  return jsonResponse(200, { userId: userData.user.id, initialPasswordAvailable: true, invitationSent: true });
});
