export const MODULE_LABELS = {plan_published:'Plano publicado',patient_diary:'Diário registrado pelo paciente',appointment_saved:'Consulta salva',anthropometry_saved:'Antropometria salva',energy_saved:'Cálculo energético salvo'};
export const CAPTURE_LABELS = {patient_created:'Paciente criado',anamnesis_completed:'Anamnese concluída',anthropometry_saved:'Antropometria salva',energy_calc_performed:'Cálculo energético',meal_plan_published:'Plano publicado',appointment_scheduled:'Consulta agendada',document_generated:'Documento gerado',ui_action_outcome:'Resultado de ação'};
export const OUTCOME_LABELS = {capture:'Captura após confirmação',started:'Iniciada',succeeded:'Sucesso informado',failed:'Falha informada',expected_failure:'Validação esperada',unknown:'Resultado desconhecido',cancelled:'Cancelada'};
const count = value => Number.isSafeInteger(value) && value>=0;
const date = value => typeof value==='string' && Number.isFinite(Date.parse(value));
export function ratio(numerator,denominator) {
  return count(numerator) && count(denominator) && denominator>0 && numerator<=denominator
    ? `${Math.round(numerator/denominator*100)}%` : 'Indisponível';
}
export function hours(value) {
  return typeof value==='number' && Number.isFinite(value) && value>=0
    ? `${value.toLocaleString('pt-BR',{maximumFractionDigits:1})} h` : 'Sem ativação observada';
}
export function validateProductMetrics(data) {
  if(data?.schema_version!==1 || data.definition_version!=='activation-v1-candidate' || ![30,90,180].includes(data.window_days)
    || !date(data.generated_at) || !date(data.capture_started_at) || !date(data.data_through)
    || data.timezone!=='America/Fortaleza' || data.retention_days!==180 || typeof data.population!=='string'
    || !Array.isArray(data.modules) || !Array.isArray(data.weekly) || !Array.isArray(data.limitations)) throw Error('invalid_admin_metrics');
  for(const value of [data.professional_population,data.historical_uncovered,data.both_sides_episodes,
    data.activation?.eligible,data.activation?.activated,data.activation?.recent,data.return?.eligible,data.return?.returned,
    data.return?.incomplete,data.consent?.allowed,data.consent?.not_allowed_or_unknown,
    data.patient_journey?.eligible_episodes,data.patient_journey?.published_episodes,data.patient_journey?.recent_episodes,
    data.patient_journey?.diary_eligible,data.patient_journey?.diary_used]) if(!count(value))throw Error('invalid_admin_metrics');
  if(data.activation.activated>data.activation.eligible || data.return.returned>data.return.eligible
    || data.return.eligible+data.return.incomplete>data.activation.activated
    || data.patient_journey.published_episodes>data.patient_journey.eligible_episodes
    || data.patient_journey.diary_eligible>data.patient_journey.published_episodes
    || data.patient_journey.diary_used>data.patient_journey.diary_eligible
    || data.consent.allowed+data.consent.not_allowed_or_unknown!==data.professional_population
    || data.historical_uncovered>data.professional_population
    || data.activation.eligible+data.activation.recent>data.professional_population
    || [data.activation.median_hours,data.activation.p90_hours].some(v=>v!==null && (typeof v!=='number'||!Number.isFinite(v)||v<0||v>=168))
    || (data.activation.activated===0 && (data.activation.median_hours!==null||data.activation.p90_hours!==null))
    || (data.activation.activated>0 && (data.activation.median_hours===null||data.activation.p90_hours===null||data.activation.p90_hours<data.activation.median_hours))
    || new Set(data.modules.map(r=>r.kind)).size!==data.modules.length || data.modules.length>5
    || new Set(data.weekly.map(r=>r.week)).size!==data.weekly.length || data.weekly.length>27
    || data.limitations.some(v=>typeof v!=='string'||v.length>1000) || data.limitations.length>20
    || data.modules.some(row=>!Object.hasOwn(MODULE_LABELS,row.kind) || !count(row.operations) || !count(row.actors) || row.actors>row.operations)
    || data.weekly.some(row=>!/^\d{4}-\d{2}-\d{2}$/.test(row.week) || !date(row.week)||new Date(row.week).toISOString().slice(0,10)!==row.week || !count(row.operations) || !count(row.actors)||row.actors>row.operations)) throw Error('invalid_admin_metrics');
  return data;
}
export function validateProductCaptures(data,days) {
 if(data?.schema_version!==1 || data.window_days!==days || !['available','not_configured'].includes(data.state)
  || !date(data.generated_at)||!Array.isArray(data.rows)||data.rows.length>20 || data.data_through!==null) throw Error('invalid_analytics_source');
 const keys=new Set();
 for(const row of data.rows) {
  const key=`${row.event}:${row.outcome}`;
  if(!Object.hasOwn(CAPTURE_LABELS,row.event)||!Object.hasOwn(OUTCOME_LABELS,row.outcome)||keys.has(key)
   || (row.event==='ui_action_outcome' ? row.outcome==='capture' : row.outcome!=='capture')
   || !count(row.captures)||!count(row.observed_people)||row.observed_people>row.captures
   || !date(row.last_observed_at)||Date.parse(row.last_observed_at)>Date.parse(data.generated_at))throw Error('invalid_analytics_source');
  keys.add(key);
 }
 if(data.state==='not_configured' && data.rows.length)throw Error('invalid_analytics_source');
 if(data.state==='available' && data.last_observed_at!==(data.rows.length ? data.rows.map(r=>r.last_observed_at).sort().at(-1) : null))throw Error('invalid_analytics_source');
 return data;
}
