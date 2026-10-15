import {readRequest} from './readRequest';
import { patientClient } from '@/infrastructure/supabase/domainClients';
import { RESERVING_APPOINTMENT_STATUSES } from '@/lib/agenda/appointment-rules';
import {executeRead,readPolicies} from '@/lib/utils/readPolicy';
import {MAX_DATA_ROWS} from './bounded-pages';

// Read-only, actor-scoped projections used by the patient home snapshot.
// Errors remain in Result; the owner must not treat them as empty data.
export function getPatientHomeLink(userId, nutritionistId, signal) {
  return readRequest(() => patientClient.from('nutritionist_patients').select('status')
    .eq('nutritionist_id', nutritionistId).eq('patient_id', userId).maybeSingle().abortSignal(signal), {signal});
}

export function getPatientHomeAppointment(userId, since, signal) {
  return readRequest(() => patientClient.from('appointments')
    .select('id,nutritionist_id,patient_id,appointment_time,notes,status,reminder_sent_at,created_at,duration,appointment_type,start_time,unregistered_patient_name,care_episode_id')
    .eq('patient_id', userId).in('status', RESERVING_APPOINTMENT_STATUSES).gte('start_time', since)
    .order('start_time', { ascending: true }).limit(1).maybeSingle().abortSignal(signal), {signal});
}

export async function getPatientHomeMeals(userId, day, signal) {
  try { return await executeRead(async budget => {
   const rows=[];let cursor=null,total=null;
   while(true){
    let query=patientClient.from('meals')
    .select('id,patient_id,meal_date,meal_time,meal_type,notes,total_calories,total_protein,total_fat,total_carbs,created_at,updated_at,is_edited,meal_plan_meal_id,adherence_score,meal_plan_id,deleted_at,photo_url,care_episode_id', { count: 'exact' })
    .eq('patient_id', userId).eq('meal_date', day).is('deleted_at', null)
    .order('id',{ascending:true}).limit(250);
    if(cursor)query=query.gt('id',cursor);
    const result=await readRequest(()=>query.abortSignal(budget),{signal:budget,policy:readPolicies.clinical});
    if(result.error)return result;
    const page=result.data||[];
    if(total===null&&Number.isInteger(result.count))total=result.count;
    if(total>MAX_DATA_ROWS||rows.length+page.length>MAX_DATA_ROWS)throw new Error('REPORT_ROW_LIMIT_REACHED');
    rows.push(...page);
    if(page.length<250||rows.length===total){
      if(total!==null&&rows.length!==total)throw new Error('HOME_MEALS_CHANGED_DURING_READ');
      return {data:rows,count:total??rows.length,error:null};
    }
    const next=page.at(-1)?.id;if(!next||next===cursor)throw new Error('HOME_MEALS_CURSOR_INVALID');cursor=next;
   }
  },{signal,policy:readPolicies.collection}); }
  catch(error){return {data:null,count:null,error};}
}
