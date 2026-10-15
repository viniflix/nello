import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTemplateBuilder } from './useTemplateBuilder';
const mocks = vi.hoisted(() => ({ user: { id: 'synthetic-a' }, diet: vi.fn(), single: vi.fn(), rpc: vi.fn(), toast: vi.fn(), navigate: vi.fn(), queue: vi.fn(), discard: vi.fn(), restore: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/hooks/useShadowDraft', () => ({ useShadowDraft: () => ({ ready: true, queue: mocks.queue, discard: mocks.discard, restore: mocks.restore }) }));
vi.mock('@/lib/supabase/template-queries', () => ({ getDietTemplateWithMeals: mocks.diet, getFoodsMapByIds: async () => ({}) }));
vi.mock('@/infrastructure/supabase/client', () => ({ supabase: { rpc: mocks.rpc, from: () => { const query = { select: () => query, eq: () => query, single: mocks.single }; return query; } } }));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
describe('Template initialization and session scope', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: 'synthetic-a' }; mocks.diet.mockResolvedValue({ data: { name: 'Original', meals: [] } }); mocks.single.mockResolvedValue({ data: { name: 'Meal', updated_at: 'revision-1' } }); mocks.rpc.mockResolvedValue({ error: null }); });
  it('preserves a dirty draft and avoids hydration on same-account session renewal', async () => {
    const { result, rerender } = renderHook(() => useTemplateBuilder('diet', 'synthetic-template'));
    await waitFor(() => expect(result.current.isLoadingTemplate).toBe(false));
    act(() => result.current.setFormData(prev => ({ ...prev, name: 'Local draft' })));
    mocks.user = { id: 'synthetic-a' }; rerender(); await act(async () => {});
    expect(mocks.diet).toHaveBeenCalledTimes(1);
    expect(result.current.formData.name).toBe('Local draft');
  });
  it('loads when type changes even with the same template id', async () => {
    const { result, rerender } = renderHook(({ type }) => useTemplateBuilder(type, 'synthetic-template'), { initialProps: { type: 'diet' } });
    await waitFor(() => expect(result.current.formData.name).toBe('Original'));
    rerender({ type: 'meal' });
    await waitFor(() => expect(result.current.formData.name).toBe('Meal'));
    expect(mocks.single).toHaveBeenCalledTimes(1);
  });
  it('ignores an older template response', async () => {
    const old = deferred(); mocks.diet.mockReturnValueOnce(old.promise);
    const { result, rerender } = renderHook(({ id }) => useTemplateBuilder('diet', id), { initialProps: { id: 'synthetic-old' } });
    rerender({ id: 'synthetic-new' });
    await waitFor(() => expect(result.current.formData.name).toBe('Original'));
    await act(async () => old.resolve({ data: { name: 'Late old template', meals: [] } }));
    expect(result.current.formData.name).toBe('Original');
  });
  it('clears new-template state when the account changes', async () => {
    const { result, rerender } = renderHook(() => useTemplateBuilder('diet'));
    act(() => result.current.setFormData(prev => ({ ...prev, name: 'Private A' })));
    mocks.queue.mockClear();
    mocks.user = { id: 'synthetic-b' }; rerender();
    expect(result.current.formData.name).toBe('');
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it('preserves the loaded revision across renewal and reports a server conflict without discarding the draft', async () => {
    const { result, rerender } = renderHook(() => useTemplateBuilder('meal', 'synthetic-template'));
    await waitFor(() => expect(result.current.isLoadingTemplate).toBe(false));
    act(() => result.current.setFormData(prev => ({ ...prev, name: 'Draft' })));
    mocks.user = { ...mocks.user }; rerender();
    mocks.rpc.mockResolvedValue({ error: { code: 'PT409', message: 'Template changed' } });
    await act(async () => result.current.handleSave());
    expect(mocks.rpc).toHaveBeenCalledWith('save_meal_template', expect.objectContaining({ p_expected_updated_at: 'revision-1', p_name: 'Draft' }));
    expect(result.current.formData.name).toBe('Draft');
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
  it('allows explicit retry after a failed initialization and never saves an empty failed load', async () => {
    mocks.diet.mockResolvedValueOnce({ error: { status: 403 } });
    const { result } = renderHook(() => useTemplateBuilder('diet', 'synthetic-template'));
    await waitFor(() => expect(result.current.loadError).toBe(true));
    await act(async () => result.current.handleSave());
    expect(mocks.rpc).not.toHaveBeenCalled();
    act(() => result.current.retryLoad());
    await waitFor(() => expect(result.current.formData.name).toBe('Original'));
    expect(result.current.loadError).toBe(false);
  });
  it('ignores successful save feedback after a switch of account', async () => {
    const saved = deferred(); mocks.rpc.mockReturnValue(saved.promise);
    const { result, rerender } = renderHook(() => useTemplateBuilder('diet'));
    act(() => result.current.setFormData(prev => ({ ...prev, name: 'Private draft' })));
    let request; act(() => { request = result.current.handleSave(); });
    mocks.user = { id: 'synthetic-b' }; rerender();
    await act(async () => { saved.resolve({ error: null }); await request; });
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.discard).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(result.current.formData.name).toBe('');
  });
  it('does not overwrite an explicitly restored shadow while a food lookup is pending', async () => {
    const old = deferred(); mocks.single.mockReturnValue(old.promise);
    mocks.restore.mockReturnValue({ formData: { name: 'Recovered draft', meals: [], foods: [], ingredients: [], tags: [] } });
    const { result } = renderHook(() => useTemplateBuilder('meal', 'synthetic-template'));
    act(() => result.current.restoreShadow());
    await act(async () => old.resolve({ data: { name: 'Server meal', updated_at: 'revision-2' } }));
    expect(result.current.formData.name).toBe('Recovered draft');
  });
});
