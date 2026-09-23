import { getInitialBiometryForEnergy, saveEnergyCalculation } from './energy-queries';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/customSupabaseClient', () => ({ supabase: { from: mocks.from } }));
vi.mock('@/lib/supabase/query-helpers', () => ({ logSupabaseError: vi.fn() }));

const payload = { patient_id: 'patient', nutritionist_id: 'professional', weight: 70, height: 175, age: 30,
  gender: 'M', tmb_protocol: 'harris', activity_factor: 1.9, injury_factor: 1.4,
  clinical_mobility: 'bedridden', injury_factor_id: 'sepsis',
  tmb_result: 123, get_result: 999999, final_planned_kcal: 999999 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockImplementation(row => ({ select: () => ({ single: async () => ({ data: row, error: null }) }) }));
});
describe('energy persistence', () => {
  it('keeps successful biometry sources when the profile request fails', async () => {
    const profileError = { message: 'profile unavailable' };
    mocks.from.mockImplementation(table => {
      const query = { select: () => query, eq: () => query, order: () => query, limit: () => query,
        single: async () => ({ data: null, error: profileError }),
        maybeSingle: async () => ({ data: table === 'growth_records' ? { weight: 70, height: 175 } : { content: { sexo: ' Feminino ', idade: 30 } }, error: null }),
      };
      return query;
    });
    const { data, error } = await getInitialBiometryForEnergy('patient');
    expect(error).toBe(profileError);
    expect(data).toMatchObject({ weight: 70, height: 175, age: 30, gender: 'F', _sources: { gender: 'anamnesis' } });
  });
  it('recalculates authoritative results and preserves precise formula and clinical context', async () => {
    const { data, error } = await saveEnergyCalculation(payload);
    expect(error).toBeNull();
    expect(data.get_result).toBeCloseTo(2859.381, 6);
    expect(data.tmb).toBe(data.tmb_result);
    expect(data.get).toBe(data.get_result);
    expect(data.activity_factor).toBe(1);
    expect(data.protocol_code).toBe('energy.harris_benedict_1919_clinical');
    expect(data.input_snapshot).toMatchObject({ clinical_mobility: 'bedridden', mobility_factor: 1.2, injury_factor_id: 'sepsis', mets_included_in_get: false });
    expect(data.output_snapshot.calculation_details.appliedTotal).toContain('1.2 × 1.4');
    expect(data.source_snapshot.engine_version).toBe(3);
    expect(data.output_snapshot.after_mobility_kcal).toBeCloseTo(2042.415, 6);
  });
  it('saves DRIs without a fictional TMB or external activity multiplier', async () => {
    const { data, error } = await saveEnergyCalculation({ ...payload, tmb_protocol: 'dri_2023', dri_activity: 'active', life_stage: 'adult' });
    expect(error).toBeNull();
    expect(data.get_result).toBeCloseTo(2934.62, 6);
    expect(data.protocol).toBe('dri_2023');
    expect(data.tmb_result).toBeNull();
    expect(data.injury_factor).toBe(1);
    expect(data.input_snapshot.dri_activity).toBe('active');
    expect(data.output_snapshot.calculation_details.formula.appliedStr).toContain('2934.62');
  });
  it('does not write an incomplete clinical calculation', async () => {
    const { error } = await saveEnergyCalculation({ ...payload, clinical_mobility: null });
    expect(error).toBeInstanceOf(Error);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each([{ injury_factor_id: null }, { injury_factor_id: 'invalid' }, { injury_factor_id: 'surgery' }])('rejects an unauditable Harris condition: %j', async changes => {
    const { error } = await saveEnergyCalculation({ ...payload, ...changes });
    expect(error).toBeInstanceOf(Error);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
