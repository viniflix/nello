import { INJURY_FACTORS, getInjuryFactorValue } from '@/lib/constants/injury-factors';
import { DRI_ACTIVITY_LEVELS } from './dri-energy';
import { parseFiniteEnergyNumber } from './energy-numbers';
import { ENERGY_ENGINE_VERSION } from '../../../supabase/functions/_shared/clinical-energy-plan.js';
export { calculateEnergyPlan, ENERGY_ENGINE_VERSION, VENTA_REVIEW_LIMITS } from '../../../supabase/functions/_shared/clinical-energy-plan.js';
export { CLINICAL_MOBILITY_FACTORS } from '../../../supabase/functions/_shared/clinical-factors.js';

export function restoreEnergyInputs(saved) {
  const input = saved?.input_snapshot || {};
  const isHarris = (saved?.tmb_protocol || saved?.protocol) === 'harris';
  const factorId = INJURY_FACTORS.some(item => item.id === input.injury_factor_id) ? input.injury_factor_id : '';
  const factorMatches = !isHarris || (factorId && (saved?.injury_factor == null || Math.abs(Number(saved.injury_factor) - getInjuryFactorValue(factorId)) < 0.000001));
  return {
    clinicalMobility: input.clinical_mobility || '',
    driActivity: DRI_ACTIVITY_LEVELS.some(item => item.id === input.dri_activity) ? input.dri_activity : '',
    lifeStage: input.life_stage || '',
    injuryFactorId: factorMatches ? factorId : '',
    requiresReview: !!saved && (saved.source_snapshot?.engine_version !== ENERGY_ENGINE_VERSION || !factorMatches),
  };
}

/** A historic VENTA target without an auditable clinical confirmation cannot be reused. */
export function energyCalculationNeedsVentaReview(saved) {
  if (!saved || saved.venta_target_weight == null || saved.venta_timeframe_days == null) return false;
  const current = parseFiniteEnergyNumber(saved.weight);
  const target = parseFiniteEnergyNumber(saved.venta_target_weight);
  if (current == null || target == null) return true;
  if (current === target) return false;
  return saved.input_snapshot?.venta_review?.confirmed !== true;
}
