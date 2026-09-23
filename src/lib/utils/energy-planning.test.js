import { describe, it, expect } from 'vitest';
import { calculateEnergyPlan, energyCalculationNeedsVentaReview, restoreEnergyInputs } from './energy-planning';
import { calculateDri2023 } from './dri-energy';
import { sumMetsActivitiesAverageDaily, calculateAllProtocols, getFormulaBreakdown } from './energy-calculations';
import { INJURY_FACTORS, getInjuryFactorValue } from '@/lib/constants/injury-factors';

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
  it.each(['bedridden', 'ambulatory'])('applies every catalog factor once after %s mobility', clinicalMobility => {
    const mobility = clinicalMobility === 'bedridden' ? 1.2 : 1.3;
    for (const factor of INJURY_FACTORS) {
      const plan = calculateEnergyPlan({ ...patient, protocol: 'harris', clinicalMobility,
        injuryFactorId: factor.id, injuryFactor: getInjuryFactorValue(factor.id) });
      expect(plan.valid).toBe(true);
      expect(plan.afterMobilityKcal).toBeCloseTo(1702.0125 * mobility, 8);
      expect(plan.getResult).toBeCloseTo(1702.0125 * mobility * factor.value, 8);
      expect(plan.finalPlannedKcal).toBe(plan.getResult);
    }
  });
  it('rejects unknown, missing and mismatched injury coefficients', () => {
    expect(getInjuryFactorValue('unknown')).toBeNull();
    expect(calculateEnergyPlan({ ...patient, protocol: 'harris', injuryFactorId: 'unknown', injuryFactor: null }).valid).toBe(false);
    expect(calculateEnergyPlan({ ...patient, protocol: 'harris', injuryFactor: null }).valid).toBe(false);
    expect(calculateEnergyPlan({ ...patient, protocol: 'harris', injuryFactorId: 'surgery', injuryFactor: 1.4 }).valid).toBe(false);
  });
  it('female Harris uses the female equation', () => {
    expect(calculateEnergyPlan({ ...patient, protocol: 'harris', gender: 'F' }).tmbResult).toBeCloseTo(1507.9455, 6);
  });
  it.each([
    ['P1', 102, 181, 47, 'M', 2057.2485],
    ['P2', 72, 175, 27, 'M', 1749.7807],
    ['P3', 88, 177, 36, 'F', 1655.7323],
  ])('reconstructs spreadsheet %s from each Harris term', (_, weight, height, age, gender, expected) => {
    const result = calculateEnergyPlan({ ...patient, weight, height, age, gender, protocol: 'harris', injuryFactor: 1.2 });
    const { constant, weight: weightTerm, height: heightTerm, age: ageTerm, result: traceResult } = result.formula.terms;
    expect(result.valid).toBe(true);
    expect(constant + weightTerm + heightTerm - ageTerm).toBeCloseTo(expected, 6);
    expect(traceResult).toBe(result.tmbResult);
    expect(result.afterMobilityKcal).toBeCloseTo(expected * 1.2, 5);
    expect(result.getResult).toBeCloseTo(expected * 1.2 * 1.2, 5);
    expect(result.formula.equationVersion).toBe('harris_benedict_1919_full_precision');
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
  it('reconciles P1 EER 2005: the first manual column used Harris times activity', () => {
    const p1 = { ...patient, weight: 102, height: 181, age: 47, gender: 'M', protocol: 'eer_iom', lifeStage: 'adult' };
    const expected = { inactive: 2813.586, low_active: 3099.53056, active: 3463.46, very_active: 4061.34408 };
    for (const [driActivity, kcal] of Object.entries(expected)) {
      const plan = calculateEnergyPlan({ ...p1, driActivity });
      expect(plan.valid).toBe(true);
      expect(plan.getResult).toBeCloseTo(kcal, 4);
    }
    expect(2057.293 * 1.2).toBeCloseTo(2468.7516, 4);
    expect(2057.293 * 1.375).toBeCloseTo(2828.777875, 4);
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
    expect(plan.requiresVentaConfirmation).toBe(true);
    expect(plan.ventaRiskLevel).toBe('review');
    expect(calculateEnergyPlan({ ...patient, protocol: 'mifflin', targetWeight: 72, timeframeDays: 70 }).finalPlannedKcal).toBe(2775.5625);
  });
  it('supports athlete equations only with valid lean mass, including comma decimals', () => {
    const athlete = { ...patient, protocol: 'cunningham', leanMass: '60,5' };
    expect(calculateEnergyPlan(athlete).tmbResult).toBe(1831);
    expect(calculateEnergyPlan({ ...athlete, protocol: 'tinsley' }).tmbResult).toBeCloseTo(1850.95, 6);
    for (const leanMass of ['', '60junk', 'Infinity', Infinity, 71]) {
      expect(calculateEnergyPlan({ ...athlete, leanMass }).valid).toBe(false);
    }
    expect(calculateEnergyPlan({ ...patient, protocol: 'mifflin', leanMass: 71 }).valid).toBe(false);
  });
  it('flags extreme VENTA plans and preserves calculated values for clinical review', () => {
    const plan = calculateEnergyPlan({ ...patient, protocol: 'mifflin', targetWeight: 61, timeframeDays: 30 });
    expect(plan.valid).toBe(true);
    expect(plan.ventaRiskLevel).toBe('high');
    expect(plan.ventaRiskReasons.length).toBeGreaterThan(0);
    expect(plan.finalPlannedKcal).toBeCloseTo(245.5625, 6);
    expect(calculateEnergyPlan({ ...patient, protocol: 'mifflin', targetWeight: '69,5', timeframeDays: '30' }).valid).toBe(true);
    expect(calculateEnergyPlan({ ...patient, protocol: 'mifflin', targetWeight: '69junk', timeframeDays: 30 }).valid).toBe(false);
  });
  it('withholds legacy VENTA targets until a confirmed replacement is saved', () => {
    const saved = { weight: 104, venta_target_weight: 95, venta_timeframe_days: 45, final_planned_kcal: 1805.66 };
    expect(energyCalculationNeedsVentaReview(saved)).toBe(true);
    expect(energyCalculationNeedsVentaReview({ ...saved, input_snapshot: { venta_review: { confirmed: false } } })).toBe(true);
    expect(energyCalculationNeedsVentaReview({ ...saved, input_snapshot: { venta_review: { confirmed: true } } })).toBe(false);
    expect(energyCalculationNeedsVentaReview({ weight: 104, final_planned_kcal: 3345 })).toBe(false);
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
    expect(restoreEnergyInputs({ source_snapshot: { engine_version: 5 }, input_snapshot: { clinical_mobility: 'ambulatory', dri_activity: 'low_active', life_stage: 'adult', injury_factor_id: 'infection' } })).toEqual({ clinicalMobility: 'ambulatory', driActivity: 'low_active', lifeStage: 'adult', injuryFactorId: 'infection', requiresReview: false });
    expect(restoreEnergyInputs({ tmb_protocol: 'harris', injury_factor: 1.4, source_snapshot: { engine_version: 2 } })).toMatchObject({ injuryFactorId: '', requiresReview: true });
    expect(restoreEnergyInputs({ tmb_protocol: 'harris', injury_factor: 1.4, source_snapshot: { engine_version: 3 }, input_snapshot: { injury_factor_id: 'surgery' } })).toMatchObject({ injuryFactorId: '', requiresReview: true });
  });
});
