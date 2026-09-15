import { calculateAllProtocols, calculateGET, calculateVentaAdjustment, getFormulaBreakdown } from './energy-calculations';
import { driPaCoefficient, validEnergyBiometry, DRI_ACTIVITY_LEVELS } from './dri-energy';

export const ENERGY_ENGINE_VERSION = 2;

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
  const mobilityFactor = isHarris ? ({ bedridden: 1.2, ambulatory: 1.3 }[data.clinicalMobility] ?? 1) : 1;
  const activityFactor = isHarris || isDri ? 1 : Number(data.activityFactor);
  const injuryFactor = isHarris ? Number(data.injuryFactor ?? 1) : 1;
  if (!Number.isFinite(activityFactor) || activityFactor < 1 || activityFactor > 3) errors.push('Fator de atividade inválido.');
  if (!Number.isFinite(injuryFactor) || injuryFactor < 1 || injuryFactor > 2) errors.push('Fator de injúria inválido.');
  const getBase = isDri ? protocol?.get : calculateGET(protocol?.bmr, isHarris ? mobilityFactor : activityFactor, injuryFactor);
  // PAL and EER already include exercise and food thermogenesis. MET entries are
  // retained for reference, never added again to an estimate of total expenditure.
  const getResult = getBase ?? 0;
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
  const totalEquation = isDri ? 'GET = EER (atividade incluída na equação)' : isHarris ? 'GET = TMB × mobilidade clínica × fator de injúria' : 'GET = TMB × fator de atividade';
  const appliedTotal = isDri ? `GET = ${getResult.toFixed(2)} kcal/dia` : `${protocol?.bmr?.toFixed(2) ?? '—'} × ${isHarris ? `${mobilityFactor} × ${injuryFactor}` : activityFactor} = ${getResult.toFixed(2)} kcal/dia`;
  return {
    valid: errors.length === 0, errors, isHarris, isDri,
    tmbResult: protocol?.bmr ?? null, getBase: getResult, getResult,
    activityFactor, mobilityFactor, injuryFactor, paCoefficient: isDri && data.protocol === 'eer_iom' ? driPaCoefficient(data.driActivity || 'inactive', data.gender) : null,
    ventaAdjustmentKcal: venta?.dailyAdjustmentKcal ?? null, finalPlannedKcal,
    formula, totalEquation, appliedTotal,
    finalEquation: `VET = ${getResult.toFixed(2)} − (${adjustment.toFixed(2)}) = ${finalPlannedKcal.toFixed(2)} kcal/dia`,
  };
}

export function restoreEnergyInputs(saved) {
  const input = saved?.input_snapshot || {};
  return {
    clinicalMobility: input.clinical_mobility || '',
    driActivity: input.dri_activity || '',
    lifeStage: input.life_stage || '',
    injuryFactorId: input.injury_factor_id || null,
    requiresReview: !!saved && saved.source_snapshot?.engine_version !== ENERGY_ENGINE_VERSION,
  };
}
