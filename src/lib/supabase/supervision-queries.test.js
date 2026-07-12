import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  endStudentSupervision,
  getMyStudentSupervisions,
  requestStudentSupervision,
  respondStudentSupervision
} from './supervision-queries';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { rpc } }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));

describe('supervision queries', () => {
  beforeEach(() => rpc.mockReset());

  it('requests a verified supervisor by email', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    await requestStudentSupervision(' SUPERVISOR@NELLO.TEST ');
    expect(rpc).toHaveBeenCalledWith('request_student_supervision_by_email', {
      p_supervisor_email: 'supervisor@nello.test'
    });
  });

  it('loads the supervision relationships visible to the signed-in professional', async () => {
    rpc.mockResolvedValue({ data: [{ status: 'pending' }], error: null });
    const result = await getMyStudentSupervisions();
    expect(rpc).toHaveBeenCalledWith('get_my_student_supervisions');
    expect(result.data).toHaveLength(1);
  });

  it('sends an audited supervisor decision', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    await respondStudentSupervision('relationship-id', 'active', 'Supervisão confirmada');
    expect(rpc).toHaveBeenCalledWith('respond_student_supervision', {
      p_supervision_id: 'relationship-id',
      p_decision: 'active',
      p_reason: 'Supervisão confirmada'
    });
  });

  it('sends an audited relationship termination', async () => {
    rpc.mockResolvedValue({ data: { success: true }, error: null });
    await endStudentSupervision('relationship-id', 'Vínculo acadêmico encerrado');
    expect(rpc).toHaveBeenCalledWith('end_student_supervision', {
      p_supervision_id: 'relationship-id',
      p_reason: 'Vínculo acadêmico encerrado'
    });
  });
});
