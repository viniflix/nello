import {readRequest} from './readRequest';
import {readPolicies} from '@/lib/utils/readPolicy';
import {collectBoundedPages, MAX_DATA_ROWS} from './bounded-pages';


import { patientClient as supabase } from '@/infrastructure/supabase/domainClients';

import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { classifyLabResultsRiskBatch, getLabRiskRules } from '@/lib/supabase/lab-results-queries';




export const getPatientsWithLowAdherence = async (nutritionistId, readOptions = {}) => {
    try {
        // OTIMIZADO: Usa função SQL que faz tudo em 1 query ao invés de N+1
        const { data, error } = await readRequest(() => supabase
            .rpc('get_patients_low_adherence_optimized', {
                p_nutritionist_id: nutritionistId,
                p_days_threshold: 2 // 2 dias = 48 horas
            }), {signal:readOptions?.signal,policy:readPolicies.clinical});

        if (error) throw error;

        // Transformar resultado para manter compatibilidade com código existente
        const lowAdherencePatients = (data || []).map(patient => ({
            id: patient.patient_id,
            name: patient.patient_name,
            last_activity: patient.last_meal_date,
            days_inactive: patient.days_since_last_meal === 9999 ? null : patient.days_since_last_meal
        }));

        return { data: lowAdherencePatients, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_detectar_baixa_adesao", error);
        return { data: [], error };
    }
};

export const getPatientsPendingData = async (nutritionistId, readOptions = {}) => {
    try {
        // OTIMIZADO: Usa função SQL que faz 5 queries ao invés de 1+(4*N)
        const { data, error } = await readRequest(() => supabase
            .rpc('get_patients_pending_data_optimized', {
                p_nutritionist_id: nutritionistId
            }), {signal:readOptions?.signal,policy:readPolicies.clinical});

        if (error) throw error;

        // Transformar resultado para manter compatibilidade com código existente
        const pendingData = (data || []).map(patient => {
            const pending = [];

            // Converter array de strings em objetos com labels e rotas
            patient.pending_items.forEach(type => {
                const pendingMap = {
                    'anamnese': {
                        type: 'anamnesis',
                        label: 'Anamnese Pendente',
                        route: `/nutritionist/patients/${patient.patient_id}/anamnese`
                    },
                    'anthropometry': {
                        type: 'anthropometry',
                        label: 'Avaliação Antropométrica Pendente',
                        route: `/nutritionist/patients/${patient.patient_id}/anthropometry`
                    },
                    'meal_plan': {
                        type: 'meal_plan',
                        label: 'Plano Alimentar Pendente',
                        route: `/nutritionist/patients/${patient.patient_id}/meal-plan`
                    },
                    'prescription': {
                        type: 'prescription',
                        label: 'Cálculo de Necessidades Pendente',
                        route: `/nutritionist/patients/${patient.patient_id}/energy-expenditure`
                    }
                };

                if (pendingMap[type]) {
                    pending.push(pendingMap[type]);
                }
            });

            return {
                patient_id: patient.patient_id,
                patient_name: patient.patient_name,
                pending_items: pending
            };
        });

        return { data: pendingData, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_detectar_pendencias", error);
        return { data: [], error };
    }
};

export const getPatientsHighRiskLabAlerts = async ({
    nutritionistId,
    patientIds = [],
    careEpisodeIds = [],
    daysWindow = 120
}) => {
    try {
        const scopedPatientIds = (patientIds || []).filter(Boolean);
        if (!nutritionistId || !scopedPatientIds.length || !careEpisodeIds.length) {
            return { data: [], error: null };
        }

        const cutoff = new Date(Date.now() - Math.max(1, Number(daysWindow) || 120) * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);

        // Pair patient/episode before batching: a separate IN list alone can mix
        // stale episode evidence with a patient's current operational scope.
        const episodes = new Map(patientIds.map((id,index)=>[id,careEpisodeIds[index]]));
        if (scopedPatientIds.some(id=>!episodes.get(id))) throw new Error('FEED_EPISODE_SCOPE_REQUIRED');
        const {data:rules,error:rulesError}=await getLabRiskRules(nutritionistId);
        if (rulesError) throw rulesError;
        const rows=[];
        for(let offset=0;offset<scopedPatientIds.length;offset+=50){
            const patients=scopedPatientIds.slice(offset,offset+50);
            const pageRows=await collectBoundedPages((start,size)=>supabase
                .from('lab_results')
                .select('id, patient_id, care_episode_id, test_name, test_value, test_unit, reference_min, reference_max, test_date, created_at, is_latest_revision, record_status')
                .in('patient_id', patients)
                .in('care_episode_id', patients.map(id=>episodes.get(id)))
                .eq('is_latest_revision', true)
                .eq('record_status', 'active')
                .gte('test_date', cutoff)
                .order('test_date', { ascending: false })
                .order('created_at', {ascending:false})
                .order('id', {ascending:false})
                .range(start,start+size-1),{maxRows:MAX_DATA_ROWS-rows.length});
            rows.push(...pageRows.filter(row=>episodes.get(row.patient_id)===row.care_episode_id));
        }

        const classified = classifyLabResultsRiskBatch(rows || [], rules || []);
        // Decide the current evidence BEFORE filtering risk. A later normal or
        // unassessable result must not resurrect an older high measurement.
        const dedupedMap = new Map();
        (classified.data || []).forEach((row) => {
            const markerKey = row.marker_key || String(row.test_name || '').toLowerCase();
            const dedupeKey = `${row.patient_id}:${markerKey}`;
            if (!dedupedMap.has(dedupeKey)) {
                dedupedMap.set(dedupeKey, {
                    result_id: row.id,
                    care_episode_id: row.care_episode_id,
                    patient_id: row.patient_id,
                    marker_key: markerKey,
                    test_name: row.test_name,
                    test_value: row.test_value,
                    test_unit: row.test_unit,
                    risk_reason: row.risk_reason,
                    test_date: row.test_date,
                    created_at: row.created_at,
                    risk_level: row.risk_level
                });
            }
        });

        return {
            data: Array.from(dedupedMap.values()).filter(row=>row.risk_level==='high'),
            error: null
        };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_alertas_de_risco_laboratorial_alto", error);
        return { data: [], error };
    }
};

export const getFeedPriorityRules = async (nutritionistId, readOptions = {}) => {
    try {
        const { data, error } = await readRequest(() => supabase
            .from('notification_rules')
            .select('id, scope, nutritionist_id, rule_key, weight, config, is_active, updated_at')
            .eq('scope', 'feed_priority')
            .eq('is_active', true)
            .or(`nutritionist_id.is.null,nutritionist_id.eq.${nutritionistId}`)
            .order('nutritionist_id', { ascending: true })
            .order('weight', { ascending: false }), {signal:readOptions?.signal,policy:readPolicies.clinical});

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_regras_de_prioridade_do_feed", error);
        return { data: [], error };
    }
};
