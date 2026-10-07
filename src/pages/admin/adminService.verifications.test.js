import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listProfessionalVerifications,
  reviewProfessionalVerification,
  decideAdminVerification
} from '@/services/adminService';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc } }));

describe('admin verification service', () => {
  beforeEach(() => rpc.mockReset());

  it('maps queue filters to the protected RPC', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'verification-1' }], error: null });
    const result = await listProfessionalVerifications({ status: 'pending', role: 'student' });
    expect(rpc).toHaveBeenCalledWith('list_professional_verifications', {
      p_status: 'pending',
      p_role: 'student'
    });
    expect(result.data).toHaveLength(1);
  });

  it('refuses an administrative decision without a reason', async () => {
    const result = await reviewProfessionalVerification({
      verificationId: 'verification-1', decision: 'approved', reason: '  ',
      sourceUrl: 'https://cfn.org.br', validUntil: '2027-01-01'
    });
    expect(result.error?.message).toBe('Justificativa obrigatória.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not confirm malformed or mismatched decisions after a successful transport', async () => {
    for (const data of [null, { success: false }, { success: true, status: 'rejected', replayed: false }, { success: true, status: 'approved' }]) {
      rpc.mockResolvedValue({ data, error: null });
      expect((await decideAdminVerification({ decision: 'approved' })).error).toBeTruthy();
    }
    rpc.mockResolvedValue({ data: { success: true, status: 'approved', replayed: true }, error: null });
    expect((await decideAdminVerification({ decision: 'approved' })).error).toBeNull();
  });
});
