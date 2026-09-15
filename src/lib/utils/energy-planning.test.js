import { describe, it, expect } from 'vitest';
import { calculateEnergyPlan, restoreEnergyInputs } from './energy-planning';
import { calculateDri2023 } from './dri-energy';
import { sumMetsActivitiesAverageDaily, calculateAllProtocols, getFormulaBreakdown } from './energy-calculations';

const patient = { weight: 70, height: 175, age: 30, gender: 'M', activityFactor: 1.55,
  injuryFactor: 1.4, clinicalMobility: 'bedridden', driActivity: 'active', lifeStage: 'adult' };

describe('one energy pipeline from biometry to VET', () => {
  it('Harris uses original coefficients and clinical mobility, regardless of exercise factor', () => {
    const bed = calculateEnergyPlan({ ...patient, protocol: 'harris' });
    expect(bed.tmbResult).toBeCloseTo(1702.0125, 6);
    expect(bed.getResult).toBeCloseTo(2859.381, 6);
    expect(bed.activityFactor).toBe(1);
    expect(bed.mobilityFactor).toBe(1.2);
    expect(calculateEnergyPlan({ ...patient, protocol: 'harris', activityFactor: 1.9 }).getResult).toBe(bed.getResult);
    expect(calculateEnergyPlan({ ...patient, protocol: 'harris', clinicalMobility: 'ambulatory' }).getResult).toBeCloseTo(3097.66275, 6);
  });
  it('Harris requires clinical mobility and does not silently infer it from exercise', () => {
    expect(calculateEnergyPlan({ ...patient, protocol: 'harris', clinicalMobility: '' }).valid).toBe(false);
  });
  it('female Harris uses the female equation', () => {
    expect(calculateEnergyPlan({ ...patient, protocol: 'harris', gender: 'F' }).tmbResult).toBeCloseTo(1507.9455, 6);
  });
  it('Mifflin applies one activity factor, ignores stale injury, MET and ETA', () => {
    const result = calculateEnergyPlan({ ...patient, protocol: 'mifflin', etaEnabled: true, metsActivities: [{ met: 8, duration_min: 60 }] });
    expect(result.tmbResult).toBe(1648.75);
    expect(result.getResult).toBe(2555.5625);
    expect(result.injuryFactor).toBe(1);
  });
  it('DRIs 2005 use sex-specific PA inside the equation, with cm converted to metres', () => {
    const male = calculateEnergyPlan({ ...patient, protocol: 'eer_iom' });
    const female = calculateEnergyPlan({ ...patient, protocol: 'eer_iom', gender: 'F' });
    expect(male.getResult).toBeCloseTo(2948.6, 6);
    expect(female.getResult).toBeCloseTo(2592.339, 6);
    expect(female.paCoefficient).toBe(1.27);
    expect(female.formula.appliedStr).toContain('1.27 ×');
    expect(female.tmbResult).toBeNull();
  });
  it.each([
    ['M', 'inactive', 2552.67], ['M', 'low_active', 2754.87],
    ['M', 'active', 2934.62], ['M', 'very_active', 3226.67],
    ['F', 'inactive', 2195.30], ['F', 'low_active', 2370.27],
    ['F', 'active', 2508.25], ['F', 'very_active', 2767.98],
  ])('DRIs 2023 published adult coefficients: %s %s', (gender, activity, expected) => {
    expect(calculateDri2023({ ...patient, gender }, activity)).toBeCloseTo(expected, 6);
  });
  it.each(['eer_iom', 'dri_2023'])('comparison, explanation and final result agree for %s', protocol => {
    const data = { ...patient, gender: 'F', driActivity: 'low_active', protocol };
    const plan = calculateEnergyPlan(data);
    expect(plan.getResult).toBe(calculateAllProtocols(data).find(p => p.id === protocol).get);
    expect(getFormulaBreakdown(protocol, data).appliedStr).toContain(plan.getResult.toFixed(2));
    expect(calculateEnergyPlan({ ...data, activityFactor: 1.9, injuryFactor: 2 }).getResult).toBe(plan.getResult);
  });
  it('applies the weight adjustment once, without rounding intermediate results', () => {
    const plan = calculateEnergyPlan({ ...patient, protocol: 'mifflin', targetWeight: 68, timeframeDays: 70 });
    expect(plan.ventaAdjustmentKcal).toBe(220);
    expect(plan.finalPlannedKcal).toBe(2335.5625);
    expect(calculateEnergyPlan({ ...patient, protocol: 'mifflin', targetWeight: 72, timeframeDays: 70 }).finalPlannedKcal).toBe(2775.5625);
  });
  it.each([{ weight: 0 }, { height: 1.75 }, { age: 17 }, { gender: 'unknown' }, { weight: Infinity }, { age: 30.5 }, { targetWeight: 0, timeframeDays: 30 }, { targetWeight: 40, timeframeDays: 1 }])('rejects invalid inputs and nonpositive targets: %j', invalid => {
    expect(calculateEnergyPlan({ ...patient, protocol: 'mifflin', ...invalid }).valid).toBe(false);
  });
  it.each([{ age: 18 }, { lifeStage: 'pregnancy' }, { lifeStage: 'lactation' }, { driActivity: 'invalid' }])('does not extrapolate adult DRIs: %j', invalid => {
    expect(calculateEnergyPlan({ ...patient, protocol: 'dri_2023', ...invalid }).valid).toBe(false);
  });
  it('recalculates MET entries with current weight and handles zero/mixed frequencies', () => {
    const activities = [{ met: 5, duration_min: 60, frequency_type: 'weekly', frequency_value: 7, kcal_per_session: 1, average_daily_kcal: 1 }, { met: 2, duration_min: 30 }, { met: 10, duration_min: 60, frequency_type: 'weekly', frequency_value: 0 }];
    expect(sumMetsActivitiesAverageDaily(activities, 80).totalAverageDailyKcal).toBe(480);
  });
  it('restores clinical and DRI selections and flags old records for review', () => {
    expect(restoreEnergyInputs({}).requiresReview).toBe(true);
    expect(restoreEnergyInputs({ source_snapshot: { engine_version: 2 }, input_snapshot: { clinical_mobility: 'ambulatory', dri_activity: 'low_active', life_stage: 'adult', injury_factor_id: 'infection' } })).toEqual({ clinicalMobility: 'ambulatory', driActivity: 'low_active', lifeStage: 'adult', injuryFactorId: 'infection', requiresReview: false });
  });
});
