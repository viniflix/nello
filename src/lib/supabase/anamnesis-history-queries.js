import {readRequest} from './readRequest';
export const ANAMNESIS_RECORD_COLUMNS='id,patient_id,template_id,nutritionist_id,version,date,content,notes,status,created_at,updated_at,template_snapshot,public_access_token,token_expires_at,lgpd_consented,lgpd_consented_at,history_log,attachments,filled_by,appointment_id,care_episode_id,template:template_id(title)';

export async function readPatientAnamnesisRecords(client,patientId,signal){
  const records=[],pageSize=100,ceiling=10000;
  for(let offset=0;offset<=ceiling;offset+=pageSize){
    const {data,error}=await readRequest(()=>client.from('anamnesis_records').select(ANAMNESIS_RECORD_COLUMNS).eq('patient_id',patientId).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+pageSize-1),{signal});
    if(error)throw error;
    if(offset===ceiling&&data?.length)throw new Error('ANAMNESIS_HISTORY_LIMIT');
    records.push(...(data||[]));if(!data||data.length<pageSize)return records;
  }
  return records;
}

export async function readPendingPatientAnamnesis(client,patientId,signal){
  const {data,error}=await readRequest(()=>client.from('anamnesis_records')
    .select('id,template_id,created_at,token_expires_at,template:template_id(title),episode:care_episode_id!inner(status)')
    .eq('patient_id',patientId).eq('status','pending_patient').eq('episode.status','active')
    .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(1),{signal});
  if(error)throw error;return data?.[0]||null;
}
