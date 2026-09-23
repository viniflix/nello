import { calculateAllProtocols, calculateGET, calculateVentaAdjustment, getFormulaBreakdown } from './energy-calculations';
import { driPaCoefficient, validEnergyBiometry, DRI_ACTIVITY_LEVELS } from './dri-energy';
import { getInjuryFactorValue, INJURY_FACTORS } from '@/lib/constants/injury-factors';

export const ENERGY_ENGINE_VERSION = 4;
export const CLINICAL_MOBILITY_FACTORS = { bedridden: 1.2, ambulatory: 1.3 };

/** Single pipeline shared by comparison, result, persistence and audit trail. */
export function calculateEnergyPlan(data) {
  const errors = [];
  const isHarris = data.protocol === 'harris';
  const isDri = ['eer_iom', 'dri_2023'].includes(data.protocol);
  if (!validEnergyBiometry(data, isDri ? 19 : 18)) errors.push(`Confira peso (1–300 kg), altura (50–255 cm), sexo e idade (${isDri ? 19 : 18}–120 anos).`);
  if (isHarris && !['bedridden', 'ambulatory'].includes(data.clinicalMobility)) errors.push('Harris-Benedict exige a indicação clínica: acamado ou ambulante.');
  if (isDri && !DRI_ACTIVITY_LEVELS.some(item => item.id === data.driActivity)) errors.push('Selecione o nível de atividade das DRIs.');
  if (isDri && data.lifeStage !== 'adult') errors.push('Estas DRIs são para adultos, fora de gestação e lactação. Confirme a aplicabilidade.');
  const protocol = calculateAllProtocols(data).find(item => item.id === data.protocol);
  if (!protocol || (isDri ? protocol.get == null : protocol.bmr == null)) errors.push('Protocolo indisponível para os dados informados.');
  const mobilityFactor = isHarris ? (CLINICAL_MOBILITY_FACTORS[data.clinicalMobility] ?? null) : 1;
  const activityFactor = isHarris || isDri ? 1 : Number(data.activityFactor);
  const catalogFactor = isHarris && data.injuryFactorId != null ? getInjuryFactorValue(data.injuryFactorId) : null;
  const injuryFactor = isHarris ? Number(data.injuryFactor) : 1;
  if (!Number.isFinite(activityFactor) || activityFactor < 1 || activityFactor > 3) errors.push('Fator de atividade inválido.');
  if (isHarris && (data.injuryFactor == null || !Number.isFinite(injuryFactor) || injuryFactor < 1 || injuryFactor > 2 || (data.injuryFactorId != null && (catalogFactor === null || Math.abs(injuryFactor - catalogFactor) > 0.000001)))) errors.push('Fator de injúria inválido ou diferente da condição selecionada.');
  const afterMobilityKcal = isHarris && mobilityFactor != null && protocol?.bmr != null ? protocol.bmr * mobilityFactor : null;
  const getBase = isDri ? protocol?.get : calculateGET(protocol?.bmr, isHarris ? mobilityFactor : activityFactor, injuryFactor);
  // PAL and EER already include exercise and food thermogenesis. MET entries are
  // retained for reference, never added again to an estimate of total expenditure.
  const getResult = getBase ?? 0;
  if (getBase == null) errors.push('Não foi possível calcular o GET com os fatores informados.');
  let venta = null;
  const hasTarget = data.targetWeight != null && data.targetWeight !== '';
  const hasDays = data.timeframeDays != null && data.timeframeDays !== '';
  if (hasTarget || hasDays) {
    if (!hasTarget || !hasDays || !Number.isFinite(Number(data.targetWeight)) || Number(data.targetWeight) < 1 || Number(data.targetWeight) > 300 || !Number.isInteger(Number(data.timeframeDays)) || Number(data.timeframeDays) <= 0) {
      errors.push('Informe peso-alvo positivo (até 300 kg) e prazo inteiro maior que zero.');
    } else venta = calculateVentaAdjustment(data.weight, data.targetWeight, data.timeframeDays);
  }
  const adjustment = venta?.dailyAdjustmentKcal ?? 0;
  const finalPlannedKcal = getResult - adjustment;
  if (!Number.isFinite(finalPlannedKcal) || finalPlannedKcal <= 0) errors.push('A meta calórica final precisa ser positiva. Revise o peso-alvo e o prazo.');
  const formula = protocol ? getFormulaBreakdown(data.protocol, data) : null;
  if (isHarris && formula?.resultKcal != null && Math.abs(formula.resultKcal - protocol.bmr) > 0.000001) {
    errors.push('A memória da fórmula Harris não confere com a TMB calculada.');
  }
  const totalEquation = isDri ? 'GET = EER (atividade incluída na equação)' : isHarris ? 'GET = TMB × mobilidade clínica × fator de injúria' : 'GET = TMB × fator de atividade';
  const appliedTotal = isDri ? `GET = ${getResult.toFixed(2)} kcal/dia` : `${protocol?.bmr?.toFixed(2) ?? '—'} × ${isHarris ? `${mobilityFactor} × ${injuryFactor}` : activityFactor} = ${getResult.toFixed(2)} kcal/dia`;
  return {
    valid: errors.length === 0, errors, isHarris, isDri,
    tmbResult: protocol?.bmr ?? null, getBase: getResult, getResult,
    activityFactor, mobilityFactor, injuryFactor, injuryFactorId: isHarris ? data.injuryFactorId ?? null : null,
    afterMobilityKcal, paCoefficient: isDri && data.protocol === 'eer_iom' ? driPaCoefficient(data.driActivity, data.gender) : null,
    ventaAdjustmentKcal: venta?.dailyAdjustmentKcal ?? null, finalPlannedKcal,
    formula, totalEquation, appliedTotal,
    finalEquation: `VET = ${getResult.toFixed(2)} − (${adjustment.toFixed(2)}) = ${finalPlannedKcal.toFixed(2)} kcal/dia`,
  };
}

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
