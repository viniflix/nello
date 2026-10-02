import { clinicalLeaf, clinicalOperation, roundClinicalFraction } from './clinical-arithmetic.js';
import { ENERGY_ARITHMETIC_POLICY, explainClinicalTree, energyFormulaTrace, parseClinicalNumber as parseFiniteEnergyNumber } from './clinical-energy.js';
import { CLINICAL_MOBILITY_FACTORS, getInjuryFactorValue, PAL_REFERENCE } from './clinical-factors.js';
export const ENERGY_ENGINE_VERSION = 6;
export const VENTA_REVIEW_LIMITS = { deficitKcalPerDay: 1000, lossKgPerWeek: 0.91 };
const DRI_ACTIVITY_LEVELS = ['inactive', 'low_active', 'active', 'very_active'].map(id => ({id}));
const driPaCoefficient = (activity, gender) => {
  const index = DRI_ACTIVITY_LEVELS.findIndex(item => item.id === activity);
  const male = /^(m|male|masculino)$/i.test(String(gender || '').trim());
  return index < 0 ? null : (male ? [1,1.11,1.25,1.48] : [1,1.12,1.27,1.45])[index];
};
const validEnergyBiometry = (data, minimumAge) => energyFormulaTrace(minimumAge === 19 ? 'dri_2023' : 'harris', {...data,driActivity:'inactive'}) !== null;
// NHLBI clinical review thresholds: https://www.nhlbi.nih.gov/files/docs/resources/heart/ob_gdlns.pdf
// Pure shared pipeline: browser, saved audit snapshot, server-generated documents.
export function calculateEnergyPlan(data = {}) {
  const raw = data;
  data = { ...data,
    weight: parseFiniteEnergyNumber(data.weight), height: parseFiniteEnergyNumber(data.height),
    age: parseFiniteEnergyNumber(data.age), leanMass: parseFiniteEnergyNumber(data.leanMass),
    activityFactor: parseFiniteEnergyNumber(data.activityFactor),
    injuryFactor: parseFiniteEnergyNumber(data.injuryFactor),
    targetWeight: parseFiniteEnergyNumber(data.targetWeight),
    timeframeDays: parseFiniteEnergyNumber(data.timeframeDays),
  };
  const errors = [];
  const isHarris = data.protocol === 'harris';
  const isDri = ['eer_iom', 'dri_2023'].includes(data.protocol);
  if (!validEnergyBiometry(data, isDri ? 19 : 18)) errors.push(`Confira peso (1–300 kg), altura (50–255 cm), sexo e idade (${isDri ? 19 : 18}–120 anos).`);
  if (raw.leanMass != null && raw.leanMass !== '' && data.leanMass == null) errors.push('Massa magra inválida.');
  if (data.leanMass != null && (data.leanMass <= 0 || data.leanMass > data.weight)) errors.push('A massa magra deve ser positiva e não pode exceder o peso corporal.');
  if (['cunningham', 'tinsley'].includes(data.protocol) && data.leanMass == null) errors.push('Cunningham e Tinsley exigem massa magra válida em kg.');
  if (isHarris && !Object.hasOwn(CLINICAL_MOBILITY_FACTORS, data.clinicalMobility)) errors.push('Harris-Benedict exige uma indicação de mobilidade clínica válida.');
  if (isDri && !DRI_ACTIVITY_LEVELS.some(item => item.id === data.driActivity)) errors.push('Selecione o nível de atividade das DRIs.');
  if (isDri && data.lifeStage !== 'adult') errors.push('Estas DRIs são para adultos, fora de gestação e lactação. Confirme a aplicabilidade.');
  const formula = energyFormulaTrace(data.protocol, data);
  const protocol = formula ? { bmr: isDri ? null : formula.resultKcal, get: isDri ? formula.resultKcal : null } : null;
  if (!protocol || (isDri ? protocol.get == null : protocol.bmr == null)) errors.push('Protocolo indisponível para os dados informados.');
  const mobilityFactor = isHarris ? (CLINICAL_MOBILITY_FACTORS[data.clinicalMobility] ?? null) : 1;
  const activityFactor = isHarris || isDri ? 1 : data.activityFactor;
  const catalogFactor = isHarris && data.injuryFactorId != null ? getInjuryFactorValue(data.injuryFactorId) : null;
  const injuryFactor = isHarris ? data.injuryFactor : 1;
  if (!Number.isFinite(activityFactor) || activityFactor < 1 || activityFactor > 3) errors.push('Fator de atividade inválido.');
  if (isHarris && (data.injuryFactor == null || !Number.isFinite(injuryFactor) || injuryFactor < 1 || injuryFactor > 2 || (data.injuryFactorId != null && (catalogFactor === null || Math.abs(injuryFactor - catalogFactor) > 0.000001)))) errors.push('Fator de injúria inválido ou diferente da condição selecionada.');
  const mobilityTree = isHarris && formula && mobilityFactor != null
    ? clinicalOperation('multiply', formula.calculationTree, clinicalLeaf('Mobilidade clínica', mobilityFactor), 'TMB × mobilidade') : null;
  const afterMobilityKcal = mobilityTree?.value ?? null;
  const totalTree = formula && Number.isFinite(activityFactor) && Number.isFinite(injuryFactor)
    ? isDri ? formula.calculationTree : isHarris ? mobilityTree && clinicalOperation('multiply', mobilityTree, clinicalLeaf('Injúria', injuryFactor), 'GET')
      : clinicalOperation('multiply', formula.calculationTree, clinicalLeaf('Atividade', activityFactor), 'GET') : null;
  const getBase = totalTree?.value ?? null;
  // PAL and EER already include exercise and food thermogenesis. MET entries are
  // retained for reference, never added again to an estimate of total expenditure.
  const getResult = getBase ?? 0;
  if (getBase == null) errors.push('Não foi possível calcular o GET com os fatores informados.');
  let venta = null;
  const hasTarget = raw.targetWeight != null && raw.targetWeight !== '';
  const hasDays = raw.timeframeDays != null && raw.timeframeDays !== '';
  if (hasTarget || hasDays) {
    if (!hasTarget || !hasDays || data.targetWeight == null || data.targetWeight < 1 || data.targetWeight > 300 || !Number.isInteger(data.timeframeDays) || data.timeframeDays <= 0 || data.timeframeDays > 2147483647) {
      errors.push('Informe peso-alvo positivo (até 300 kg) e prazo inteiro entre 1 e 2.147.483.647 dias.');
    } else venta = true;
  }
  let adjustmentTree = null;
  if (venta) adjustmentTree = clinicalOperation('divide',
    clinicalOperation('multiply', clinicalOperation('subtract', clinicalLeaf('Peso atual', data.weight, 'kg'), clinicalLeaf('Peso-alvo', data.targetWeight, 'kg'), 'Diferença de peso', 'kg'), clinicalLeaf('Conversão aproximada', 7700, 'kcal/kg'), 'Energia da meta', 'kcal'),
    clinicalLeaf('Prazo', data.timeframeDays, 'day'), 'Ajuste diário');
  const adjustment = adjustmentTree?.value ?? 0;
  const finalTree = totalTree ? clinicalOperation('subtract', totalTree, adjustmentTree || clinicalLeaf('Sem ajuste', 0, 'kcal/day'), 'VET') : null;
  const finalPlannedKcal = finalTree?.value ?? getResult - adjustment;
  if (!Number.isFinite(finalPlannedKcal) || finalPlannedKcal <= 0) errors.push('A meta calórica final precisa ser positiva. Revise o peso-alvo e o prazo.');
  const requiresVentaConfirmation = venta != null && Math.abs(adjustment) > 0;
  const weeklyWeightChangeKg = venta ? Math.abs(data.weight - data.targetWeight) * 7 / data.timeframeDays : 0;
  const ventaRiskReasons = [];
  if (adjustment > VENTA_REVIEW_LIMITS.deficitKcalPerDay) ventaRiskReasons.push('Déficit acima de 1.000 kcal/dia.');
  if (adjustment > 0 && weeklyWeightChangeKg > VENTA_REVIEW_LIMITS.lossKgPerWeek) ventaRiskReasons.push('Perda projetada acima de 0,91 kg/semana.');
  if (requiresVentaConfirmation && protocol?.bmr != null && finalPlannedKcal < protocol.bmr) ventaRiskReasons.push('Meta calórica inferior à TMB estimada; avalie o contexto clínico.');
  const ventaRiskLevel = !requiresVentaConfirmation ? 'maintenance' : ventaRiskReasons.length ? 'high' : 'review';
  if (isHarris && formula?.resultKcal != null && Math.abs(formula.resultKcal - protocol.bmr) > 0.000001) {
    errors.push('A memória da fórmula Harris não confere com a TMB calculada.');
  }
  const totalEquation = isDri ? 'GET = EER (atividade incluída na equação)' : isHarris ? 'GET = TMB × mobilidade clínica × fator de injúria' : 'GET = TMB × fator de atividade';
  const appliedTotal = isDri ? `GET = ${getResult} kcal/dia` : `${protocol?.bmr ?? '—'} × ${isHarris ? `${mobilityFactor} × ${injuryFactor}` : activityFactor} = ${getResult} kcal/dia`;
  return {
    valid: errors.length === 0, errors, isHarris, isDri,
    tmbResult: protocol?.bmr ?? null, getBase: getResult, getResult,
    activityFactor, mobilityFactor, injuryFactor, injuryFactorId: isHarris ? data.injuryFactorId ?? null : null,
    afterMobilityKcal, paCoefficient: isDri && data.protocol === 'eer_iom' ? driPaCoefficient(data.driActivity, data.gender) : null,
    ventaAdjustmentKcal: adjustmentTree?.value ?? null, finalPlannedKcal,
    requiresVentaConfirmation, ventaRiskLevel, ventaRiskReasons, weeklyWeightChangeKg,
    formula, totalEquation, appliedTotal,
    engineVersion: ENERGY_ENGINE_VERSION, arithmeticPolicy: ENERGY_ARITHMETIC_POLICY,
    activityReference: !isHarris && !isDri ? PAL_REFERENCE : null,
    calculationTree: finalTree,
    exactResults: { tmb: isDri ? null : formula?.calculationTree?.exact ?? null, get: totalTree?.exact ?? null,
      adjustment: adjustmentTree?.exact ?? null, planned: finalTree?.exact ?? null },
    finalEquation: finalTree ? `VET = ${explainClinicalTree(finalTree)} = ${roundClinicalFraction(finalTree.exact)} kcal/dia` : 'Cálculo indisponível',
  };
}
