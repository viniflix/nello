import { roundClinicalFraction } from './clinical-arithmetic.js';
import { calculateEnergyPlan, ENERGY_ENGINE_VERSION } from './clinical-energy-plan.js';

const text = value => String(value ?? '').replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const describe = (value, depth = 0) => {
  if (depth > 12) throw new Error('document_too_deep');
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(item=>describe(item, depth+1)).join('\n');
  if (typeof value === 'object') return Object.entries(value).map(([key,item])=>`${key}: ${describe(item,depth+1)}`).join('\n');
  return text(value);
};
export const energyInputsFromSnapshot = row => {
  const input = row.input_snapshot || {};
  return { weight:input.weight_kg, height:input.height_cm, age:input.age_years, gender:input.sex,
    leanMass:input.lean_mass_kg, protocol:row.tmb_protocol, activityFactor:input.activity_factor,
    injuryFactor:input.injury_factor, injuryFactorId:input.injury_factor_id, clinicalMobility:input.clinical_mobility,
    driActivity:input.dri_activity, lifeStage:input.life_stage,
    targetWeight:input.venta_target_weight,timeframeDays:input.venta_timeframe_days };
};
/** Stored evaluation, never recalculated with a newer engine when exporting history. */
export function energyDocument(row) {
  if (!row?.id) throw new Error('saved_calculation_required');
  let details = row.output_snapshot?.calculation_details;
  if (Number(row.source_snapshot?.engine_version) === ENERGY_ENGINE_VERSION) {
    const calculated = calculateEnergyPlan(energyInputsFromSnapshot(row));
    const matchesExact = details?.exactResults && ['tmb','get','adjustment','planned'].every(key => {
      const stored = details.exactResults[key], expected = calculated.exactResults[key];
      return expected === null ? stored === null : stored?.numerator === expected.numerator && stored?.denominator === expected.denominator;
    });
    const matchesNumeric = [[row.tmb_result,calculated.tmbResult], [row.get_result,calculated.getResult],
      [row.venta_adjustment_kcal,calculated.ventaAdjustmentKcal], [row.final_planned_kcal,calculated.finalPlannedKcal]]
      .every(([stored,expected])=>expected === null ? stored === null : Number.isFinite(Number(stored)) && stored != null && Math.abs(Number(stored)-expected)<=1e-8);
    if (!calculated.valid || !matchesExact || !matchesNumeric)
      throw new Error('saved_calculation_integrity_failed');
    details = calculated;
  }
  const exact = details?.exactResults;
  const display = (key,value) => exact?.[key] ? roundClinicalFraction(exact[key]) : value == null ? 'Não registrado' : String(value);
  return { title:'Memória de cálculo energético',fileName:`nello-energia-${row.id}.pdf`,lines:[
    `Registro: ${row.id}`, `Salvo em: ${row.created_at || 'Não registrado'}`,
    `Motor: ${row.source_snapshot?.engine_version ?? 'legado'}; protocolo: ${row.tmb_protocol || row.protocol}`,
    `Paciente (ID): ${row.patient_id}`, `Peso: ${row.weight} kg; altura: ${row.height} cm; idade: ${row.age} anos; sexo da equação: ${row.gender}`,
    `Origem dos valores: ${describe(row.input_snapshot?.biometry_sources || 'Não registrada no histórico')}`,
    `TMB: ${display('tmb',row.tmb_result ?? row.tmb)} kcal/dia`,
    `GET: ${display('get',row.get_result ?? row.get)} kcal/dia`,
    `Ajuste VENTA: ${display('adjustment',row.venta_adjustment_kcal ?? 0)} kcal/dia`,
    `VET: ${display('planned',row.final_planned_kcal ?? row.get_result ?? row.get)} kcal/dia`,
    details?.formula?.formulaName || 'Fórmula não registrada nesta versão',details?.formula?.equationStr,
    details?.formula?.appliedStr,details?.totalEquation,details?.appliedTotal,details?.finalEquation,
    `Referência: ${details?.formula?.sourceUrl || row.source_snapshot?.formula_reference?.url || 'Não registrada'}`,
    details?.activityReference ? `PAL: ${details.activityReference.title}; ${details.activityReference.url}` : '',
    row.source_snapshot?.clinical_factor_reference ? `Fatores: ${row.source_snapshot.clinical_factor_reference.title}; ${row.source_snapshot.clinical_factor_reference.url}` : '',
    'Valores do registro salvo, sem alterar ou recalcular o histórico. Arredondamento somente no resumo; a memória preserva os operandos.',
    'Estimativa energética sujeita à variabilidade individual. VENTA usa aproximação estática de 7.700 kcal/kg, não uma previsão garantida de peso.',
  ].filter(Boolean).flatMap(line=>String(line).split('\n')) };
}
export function canonicalDocument(artifact) {
  if (!artifact?.id || !artifact.canonical_payload || !artifact.sha256) throw new Error('canonical_document_required');
  const payload = artifact.canonical_payload, content = payload.content || {};
  const professional = payload.professional || {}, patient = payload.patient || {};
  return {title:text(content.title || 'Documento clínico'), fileName:`nello-documento-${artifact.id}.pdf`,lines:[
    professional.clinic_name || '', `${professional.name || 'Profissional responsável'} ${professional.normalized_crn || ''}`,
    `Paciente: ${patient.name || 'Não informado'}`,patient.birth_date ? `Nascimento: ${patient.birth_date}` : '',
    ...Object.entries(content).filter(([key])=>!['title','source_canonical_hash'].includes(key)).map(([key,value])=>`${key}: ${describe(value)}`),
    `Status: ${artifact.status}`,artifact.signed_at ? `Assinado em: ${artifact.signed_at}` : '',
    artifact.authenticity_code ? `Autenticidade: ${artifact.authenticity_code}` : '', `SHA-256 canônico: ${artifact.sha256}`,
  ].filter(Boolean).flatMap(line=>String(line).split('\n'))};
}
export function storedClinicalDocument(kind, records, identity={}) {
  const row=records[0];
  if (!row?.id) throw new Error('saved_document_required');
  if (kind==='anthropometryRecordId' && (records.length!==2 || records[1].patient_id!==row.patient_id)) throw new Error('comparison_scope_required');
  const labels={mealPlanId:'Plano alimentar',anamnesisRecordId:'Anamnese',anthropometryRecordId:'Comparativo antropométrico'};
  const lines=[`Paciente: ${identity.patientName || row.patient_id || 'Modelo sem paciente'}`,
    identity.professionalName ? `Profissional: ${identity.professionalName}` : '',
    'Exportação de registros salvos; valores históricos preservados.'];
  for(const record of records){
    lines.push(`Registro: ${record.id}; data: ${record.date || record.record_date || record.created_at || 'Não registrada'}`);
    if(kind==='mealPlanId') {
      lines.push(record.name || '',record.description || '');
      for(const meal of [...(record.meal_plan_meals || [])].sort((a,b)=>(a.order_index??0)-(b.order_index??0))) {
        lines.push(`${meal.name || meal.meal_type || 'Refeição'} ${meal.meal_time || ''}`,meal.notes || '');
        for(const food of [...(meal.meal_plan_foods || [])].sort((a,b)=>(a.order_index??0)-(b.order_index??0))) {
          lines.push(`${food.patient_description || food.food?.name || 'Alimento'}: ${food.quantity} ${food.unit || ''}`,
            identity.includeNutrients!==false ? `Energia salva: ${food.calories} kcal; proteína: ${food.protein} g; carboidratos: ${food.carbs} g; gordura: ${food.fat} g` : '',
            food.notes || '',food.substitutes?.length ? `Substituições: ${describe(food.substitutes)}` : '');
        }
      }
    } else if(kind==='anamnesisRecordId') lines.push(describe(record.content),record.notes || '');
    else lines.push(`Peso: ${record.weight} kg; altura: ${record.height} cm`,describe(record.results),describe(record.circumferences),describe(record.skinfolds),record.notes || '');
  }
  return {title:labels[kind],fileName:`nello-${kind}-${row.id}.pdf`,lines:lines.filter(Boolean).flatMap(line=>String(line).split('\n'))};
}
