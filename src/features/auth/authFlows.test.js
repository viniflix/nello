import { describe, expect, it, vi } from 'vitest';
import {
  clearForcedPasswordReset,
  isExpectedLoginRejection,
  normalizeAuthEmail,
  redeemPatientInvite,
  requestPasswordRecovery,
  updateAndVerifyPassword,
  validateNewPassword,
} from './authFlows';

describe('authFlows', () => {
  it('normalizes only the email and preserves the exact password credential', async () => {
    const updateUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1' }, session: { access_token: 'verified' } },
      error: null,
    });
    const client = { auth: { updateUser, signInWithPassword } };
    const password = ' Nova senha 123 ';

    await updateAndVerifyPassword(client, {
      session: { user: { id: 'user-1', email: ' Teste@Exemplo.COM ' } },
      password,
    });

    expect(updateUser).toHaveBeenCalledWith({ password });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'teste@exemplo.com',
      password,
    });
  });

  it('never reports success when the updated credential cannot authenticate', async () => {
    const client = {
      auth: {
        updateUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: null },
          error: Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials' }),
        }),
      },
    };

    await expect(updateAndVerifyPassword(client, {
      session: { user: { id: 'user-1', email: 'user@example.com' } },
      password: 'Senha segura 123',
    })).rejects.toMatchObject({ passwordWasUpdated: true, code: 'invalid_credentials' });
  });

  it('does not attempt login when the password update fails', async () => {
    const updateError = new Error('update failed');
    const signInWithPassword = vi.fn();
    const client = {
      auth: {
        updateUser: vi.fn().mockResolvedValue({ data: null, error: updateError }),
        signInWithPassword,
      },
    };

    await expect(updateAndVerifyPassword(client, {
      session: { user: { id: 'user-1', email: 'user@example.com' } },
      password: 'Senha segura 123',
    })).rejects.toBe(updateError);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('requests recovery with normalized email and a marked recovery route', async () => {
    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    const client = { auth: { resetPasswordForEmail } };

    await requestPasswordRecovery(client, ' User@Example.com ', 'https://nello.example');

    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://nello.example/update-password?mode=recovery',
    });
  });

  it('uses the canonical invite RPC argument for manual and automatic redemption', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { success: true }, error: null });

    const result = await redeemPatientInvite({ rpc }, ' abcd-1234 ');

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('redeem_invite_code', { input_code: 'ABCD-1234' });
  });

  it('clears forced reset only for the authenticated profile', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ update });

    await clearForcedPasswordReset({ from }, 'user-1');

    expect(from).toHaveBeenCalledWith('user_profiles');
    expect(update).toHaveBeenCalledWith({ needs_password_reset: false });
    expect(eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('applies the same password policy to recovery, first access and registration', () => {
    expect(normalizeAuthEmail(' A@B.COM ')).toBe('a@b.com');
    expect(validateNewPassword('1234567', '1234567')).toContain('8 caracteres');
    expect(validateNewPassword('12345678', '87654321')).toBe('As senhas não coincidem.');
    expect(validateNewPassword('        ', '        ')).toContain('apenas espaços');
    expect(validateNewPassword('Senha segura 123', 'Senha segura 123')).toBeNull();
  });

  it('separates expected credential rejection from operational authentication failures', () => {
    expect(isExpectedLoginRejection({ code: 'invalid_credentials', status: 400 })).toBe(true);
    expect(isExpectedLoginRejection({ code: 'email_not_confirmed', status: 400 })).toBe(true);
    expect(isExpectedLoginRejection({ code: 'invalid_credentials', status: 500 })).toBe(false);
    expect(isExpectedLoginRejection({ code: 'over_request_rate_limit', status: 429 })).toBe(false);
  });
});
