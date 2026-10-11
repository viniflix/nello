import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateClinicSettings } from './profile-queries';
const mock = vi.hoisted(() => ({ from: vi.fn(), log: vi.fn() }));
vi.mock('@/infrastructure/supabase/domainClients', () => ({ patientClient: { from: mock.from } }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: mock.log }));

function arrange(writeError = null) {
    const original = { preferences: { theme: 'dark' }, clinic_settings: { agenda: { startTime: '08:00' }, recurring_expenses: [{ id: 'existing', value: 50 }], monthlyFinancialGoal: 1000 } };
    const read = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: original, error: null }) };
    const write = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: writeError ? null : { id: 'owner', clinic_settings: { ...original.clinic_settings, monthlyFinancialGoal: 0 }, preferences: original.preferences }, error: writeError }) };
    mock.from.mockReturnValueOnce(read).mockReturnValueOnce(write);
    return { original, read, write };
}
describe('clinic settings scoped updates', () => {
    beforeEach(() => vi.clearAllMocks());
    it('saves a zero goal once while preserving agenda, recurring expenses and preferences', async () => {
        const { original, write } = arrange();
        const saved = await updateClinicSettings('owner', { monthlyFinancialGoal: 0 });
        expect(saved.clinic_settings.monthlyFinancialGoal).toBe(0);
        expect(write.update).toHaveBeenCalledExactlyOnceWith({ clinic_settings: { ...original.clinic_settings, monthlyFinancialGoal: 0 } });
        expect(write.eq).toHaveBeenCalledWith('id', 'owner');
        expect(write.select).toHaveBeenCalledWith('id,clinic_settings,preferences');
        expect(mock.from).toHaveBeenCalledTimes(2);
        expect(saved.preferences).toEqual(original.preferences);
    });
    it('surfaces denied writes without attempting a second write through preferences', async () => {
        const denied = { code: '42501', message: 'permission denied' };
        const { write } = arrange(denied);
        await expect(updateClinicSettings('owner', { monthlyFinancialGoal: 0 })).rejects.toEqual(denied);
        expect(write.update).toHaveBeenCalledTimes(1);
        expect(mock.from).toHaveBeenCalledTimes(2);
        expect(mock.log).toHaveBeenCalledWith('Error updating clinic settings', denied);
    });
});
