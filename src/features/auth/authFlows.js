const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72;
const EXPECTED_LOGIN_REJECTION_CODES = new Set([
  'invalid_credentials',
  'email_not_confirmed',
  'user_banned',
]);

export function normalizeAuthEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isExpectedLoginRejection(error) {
  const status = Number(error?.status || error?.statusCode);
  return status === 400 && EXPECTED_LOGIN_REJECTION_CODES.has(String(error?.code || ''));
}

export function validateNewPassword(password, confirmation = password) {
  if (password !== confirmation) {
    return 'As senhas não coincidem.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `A senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  if (!password.trim()) {
    return 'A senha não pode conter apenas espaços.';
  }
  return null;
}

export async function requestPasswordRecovery(authClient, email, origin) {
  const normalizedEmail = normalizeAuthEmail(email);
  if (!normalizedEmail) throw new Error('Informe um e-mail válido.');

  const { data, error } = await authClient.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: `${origin}/update-password?mode=recovery`,
  });
  if (error) throw error;
  return data;
}

/**
 * Updates the password and immediately proves that the exact credential sent by
 * the controlled form authenticates. A success toast must only be shown after
 * both remote operations succeed.
 */
export async function updateAndVerifyPassword(authClient, { session, password }) {
  const email = normalizeAuthEmail(session?.user?.email);
  if (!session?.user?.id || !email) {
    throw new Error('Sessão de recuperação inválida ou expirada. Solicite um novo link.');
  }

  const { data: updated, error: updateError } = await authClient.auth.updateUser({ password });
  if (updateError) throw updateError;
  if (updated?.user?.id !== session.user.id) {
    throw new Error('Não foi possível confirmar a conta atualizada. Solicite um novo link.');
  }

  const { data: verified, error: verifyError } = await authClient.auth.signInWithPassword({
    email,
    password,
  });
  if (verifyError || verified?.user?.id !== session.user.id) {
    const error = verifyError || new Error('A nova senha não pôde ser validada.');
    error.passwordWasUpdated = true;
    throw error;
  }

  return { updated, verified };
}

export async function clearForcedPasswordReset(authClient, userId) {
  if (!userId) return;
  const { error } = await authClient
    .from('user_profiles')
    .update({ needs_password_reset: false })
    .eq('id', userId);
  if (error) throw error;
}

export async function redeemPatientInvite(authClient, code) {
  const inputCode = String(code || '').trim().toUpperCase();
  if (!inputCode) throw new Error('Digite o código que você recebeu.');

  const { data, error } = await authClient.rpc('redeem_invite_code', {
    input_code: inputCode,
  });
  if (error) throw error;
  return typeof data === 'string' ? JSON.parse(data) : data;
}

export const authFlowPolicy = {
  minPasswordLength: MIN_PASSWORD_LENGTH,
  maxPasswordLength: MAX_PASSWORD_LENGTH,
};
