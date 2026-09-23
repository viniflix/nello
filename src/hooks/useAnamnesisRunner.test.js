import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnamnesisRunner } from './useAnamnesisRunner';

const mocks = vi.hoisted(() => ({
  mutationOptions: [],
  useMutation: vi.fn((options) => {
    mocks.mutationOptions.push(options);
    return { mutateAsync: vi.fn() };
  }),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  recordEq: vi.fn(),
  recordIn: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: mocks.useMutation,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: mocks.from, rpc: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'nutritionist-1' } }) }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

describe('useAnamnesisRunner creation episode contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mutationOptions.length = 0;
    const templateBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { title: 'Inicial', description: null, sections: [{ id: 's', title: 'Dados', fields: [{ id: 'f', label: 'Queixa', type: 'text' }] }], version: 1 },
        error: null,
      }),
    };
    const recordBuilder = {
      insert: mocks.insert.mockReturnThis(),
      update: mocks.update.mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: mocks.recordEq.mockReturnThis(),
      in: mocks.recordIn.mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'record-1', status: 'draft' }, error: null }),
    };
    mocks.from.mockImplementation((table) => table === 'anamnesis_templates' ? templateBuilder : recordBuilder);
  });

  it('persists the exact writable episode supplied by the record foundation', async () => {
    renderHook(() => useAnamnesisRunner('patient-1'));
    await mocks.mutationOptions[0].mutationFn({ templateId: 'template-1', episodeId: 'episode-1' });

    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      patient_id: 'patient-1',
      nutritionist_id: 'nutritionist-1',
      care_episode_id: 'episode-1',
      template_id: 'template-1',
    }));
  });

  it('updates only an open record owned by the selected patient and nutritionist', async () => {
    renderHook(() => useAnamnesisRunner('patient-1'));
    await mocks.mutationOptions[1].mutationFn({ recordId: 'record-1', content: { field: 'value' }, status: 'validated' });

    expect(mocks.recordEq).toHaveBeenCalledWith('id', 'record-1');
    expect(mocks.recordEq).toHaveBeenCalledWith('patient_id', 'patient-1');
    expect(mocks.recordEq).toHaveBeenCalledWith('nutritionist_id', 'nutritionist-1');
    expect(mocks.recordIn).toHaveBeenCalledWith('status', ['draft', 'pending_patient']);
  });
});
