import { describe, expect, it } from 'vitest';
import { readAnthropometryEnergyValues, restoreEnergyBiometry } from './energy-inputs';
import { calculateEnergyPlan, restoreEnergyInputs } from './energy-planning';
import { calculateAllProtocols, calculateEerIom, getFormulaBreakdown } from './energy-calculations';
import { calculateDri2023, driActivityOptionLabel } from './dri-energy';

const patient = { weight: 70, height: 175, age: 30, gender: 'F' };
describe('DRI missing input regression', () => {
  it('passes the stored Pollock values to energy formulas without losing body fat', () => {
    expect(readAnthropometryEnergyValues({ protocol: 'pollock7', equation_version: 1, sex_used: 'female', age_years: 30, body_fat_percent: 25.5, lean_mass_kg: 52.15 })).toEqual({
      body_fat_percentage: 25.5, lean_mass_kg: 52.15,
    });
    expect(readAnthropometryEnergyValues({ protocol: 'pollock7', body_fat_percent: 25.5, lean_mass_kg: 52.15 })).toEqual({
      body_fat_percentage: null, lean_mass_kg: null,
    });
    expect(readAnthropometryEnergyValues({ body_fat_percent: 'invalid', lean_mass_kg: 'NaN' })).toEqual({
      body_fat_percentage: null, lean_mass_kg: null,
    });
  });
  it('does not classify an unknown activity as inactive or calculate an implicit sedentary EER', () => {
    const result = calculateAllProtocols(patient).filter(p => p.isEer);
    expect(result.every(p => p.get === null)).toBe(true);
    expect(calculateDri2023(patient)).toBeNull();
    expect(getFormulaBreakdown('eer_iom', patient)).toBeNull();
    expect(restoreEnergyInputs({ input_snapshot: { dri_activity: 'bad' } }).driActivity).toBe('');
    expect(restoreEnergyInputs({ activity_factor: 1.55 }).driActivity).toBe('');
  });
  it.each([null, '', undefined, 'desconhecido'])('never formats a missing sex as PA null: %s', gender => {
    expect(driActivityOptionLabel('inactive', 'eer_iom', gender)).toBe('Sedentário (inativo)');
    expect(calculateEerIom(70, 175, 30, 1.27, gender)).toBeNull();
  });
  it('rejects missing PA rather than falling back to 1', () => {
    expect(calculateEerIom(70, 175, 30, null, 'F')).toBeNull();
    expect(calculateEerIom(70, 175, 30, 1.25, 'F')).toBeNull();
    expect(calculateEerIom(70, 175, 30, 1.27, 'F')).toBeCloseTo(2592.339, 6);
  });
  it('normalizes supported sex spellings and formats the actual selected coefficient', () => {
    const inputs = restoreEnergyBiometry({ ...patient, gender: ' Feminino ' });
    expect(inputs.gender).toBe('F');
    expect(driActivityOptionLabel('active', 'eer_iom', inputs.gender)).toBe('Ativo (PA 1,27)');
    expect(driActivityOptionLabel('active', 'dri_2023', inputs.gender)).toBe('Ativo');
  });
  it('recovers missing biometry from saved calculation with source shown, preserving current measurements', () => {
    const inputs = restoreEnergyBiometry({ weight: 80, gender: '', _sources: { weight: 'anthropometry' } }, {
      weight: 70, height: 175, age: 30, gender: 'female', input_snapshot: { sex: 'F' },
    });
    expect(inputs).toMatchObject({ weight: 80, height: 175, age: 30, gender: 'F', _sources: { gender: 'saved', weight: 'anthropometry' } });
    const plan = calculateEnergyPlan({ ...inputs, protocol: 'eer_iom', driActivity: 'active', lifeStage: 'adult' });
    expect(plan.valid).toBe(true);
    expect(plan.paCoefficient).toBe(1.27);
    expect(plan.getResult).toBeCloseTo(2711.211, 6);
  });
  it('does not infer sex from names, activity, or an invalid historic value', () => {
    expect(restoreEnergyBiometry({}, { gender: 'unknown', name: 'Ana' }).gender).toBeNull();
  });
  it('restores explicitly saved inactive and active selections unchanged', () => {
    for (const dri_activity of ['inactive', 'low_active', 'active', 'very_active']) {
      expect(restoreEnergyInputs({ input_snapshot: { dri_activity } }).driActivity).toBe(dri_activity);
    }
  });
});
