import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn();
const mockLogSupabaseError = vi.fn();

vi.mock('@/lib/customSupabaseClient', () => ({
  supabase: { rpc: mockRpc },
}));

vi.mock('@/lib/supabase/query-helpers', async (importOriginal) => ({
  ...(await importOriginal()),
  logSupabaseError: mockLogSupabaseError,
}));

const {
  getEmptyPatientRemovalStatus,
  removeEmptyPatient,
} = await import('@/lib/supabase/patient-queries');

describe('remoção segura de cadastro vazio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consulta a autorização no servidor em vez de inferir pelo cliente', async () => {
    mockRpc.mockResolvedValue({ data: { can_remove: true }, error: null });

    const result = await getEmptyPatientRemovalStatus('patient-1');

    expect(mockRpc).toHaveBeenCalledWith('get_empty_patient_removal_status', {
      p_patient_id: 'patient-1',
    });
    expect(result.data.can_remove).toBe(true);
  });

  it('falha de forma fechada quando a verificação não responde', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('network error') });

    const result = await getEmptyPatientRemovalStatus('patient-1');

    expect(result.data).toEqual({ can_remove: false, reason: 'status_check_failed' });
    expect(result.error).toBeInstanceOf(Error);
  });

  it('só confirma a remoção quando o servidor confirma a transação', async () => {
    mockRpc.mockResolvedValue({ data: { success: true }, error: null });

    const result = await removeEmptyPatient('patient-1');

    expect(mockRpc).toHaveBeenCalledWith('remove_empty_patient', {
      p_patient_id: 'patient-1',
    });
    expect(result.success).toBe(true);
  });

  it('propaga falha do banco sem produzir falso sucesso', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('constraint violation') });

    const result = await removeEmptyPatient('patient-1');

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe('constraint violation');
  });
});
