import { supabase } from '@/infrastructure/supabase/client';
import { GLYCEMIA_MIN_MG_DL, GLYCEMIA_MAX_MG_DL } from '@/lib/utils/glycemia';

const newest = (query, dateColumn, limit) => query
  .order(dateColumn, { ascending: false, nullsFirst: false })
  .order('created_at', { ascending: false, nullsFirst: false })
  .order('id', { ascending: true })
  .limit(limit);

export const getLatestClinicalWeights = patientId => newest(supabase.from('growth_records')
  .select('id,weight,record_date,created_at,status,is_latest_revision')
  .eq('patient_id', patientId).eq('status', 'active').eq('is_latest_revision', true)
  .gt('weight', 0).lt('weight', 'Infinity'), 'record_date', 2);

export const getLatestSelfWeights = patientId => newest(supabase.from('patient_progress_measurements')
  .select('id,weight,record_date,created_at')
  .eq('patient_id', patientId).gt('weight', 0).lt('weight', 'Infinity'), 'record_date', 2);

export const getLatestGlycemia = patientId => newest(supabase.from('glycemia_records')
  .select('id,value,date,condition,created_at')
  .eq('patient_id', patientId).gte('value', GLYCEMIA_MIN_MG_DL).lte('value', GLYCEMIA_MAX_MG_DL), 'date', 1);
