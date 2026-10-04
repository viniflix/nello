

import { patientClient as supabase } from '@/infrastructure/supabase/domainClients';

import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { classifyLabResultsRiskBatch, getLabRiskRules } from '@/lib/supabase/lab-results-queries';




export const getPatientsWithLowAdherence = async (nutritionistId) => {
    try {
        // OTIMIZADO: Usa função SQL que faz tudo em 1 query ao invés de N+1
        const { data, error } = await supabase
            .rpc('get_patients_low_adherence_optimized', {
                p_nutritionist_id: nutritionistId,
                p_days_threshold: 2 // 2 dias = 48 horas
            });

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

export const getPatientsPendingData = async (nutritionistId) => {
    try {
        // OTIMIZADO: Usa função SQL que faz 5 queries ao invés de 1+(4*N)
        const { data, error } = await supabase
            .rpc('get_patients_pending_data_optimized', {
                p_nutritionist_id: nutritionistId
            });

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

        const [{ data: rules, error: rulesError }, { data: rows, error: rowsError }] = await Promise.all([
            getLabRiskRules(nutritionistId),
            supabase
                .from('lab_results')
                .select('id, patient_id, test_name, test_value, test_unit, reference_min, reference_max, test_date, created_at')
                .in('patient_id', scopedPatientIds)
                .in('care_episode_id', careEpisodeIds)
                .gte('test_date', cutoff)
                .order('test_date', { ascending: false })
                .limit(500)
        ]);

        if (rulesError) throw rulesError;
        if (rowsError) throw rowsError;

        const classified = classifyLabResultsRiskBatch(rows || [], rules || []);
        const highRiskRows = (classified.data || []).filter((item) => item.risk_level === 'high');

        const dedupedMap = new Map();
        highRiskRows.forEach((row) => {
            const markerKey = row.marker_key || String(row.test_name || '').toLowerCase();
            const dedupeKey = `${row.patient_id}:${markerKey}`;
            if (!dedupedMap.has(dedupeKey)) {
                dedupedMap.set(dedupeKey, {
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
            data: Array.from(dedupedMap.values()),
            error: null
        };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_alertas_de_risco_laboratorial_alto", error);
        return { data: [], error };
    }
};

export const getFeedPriorityRules = async (nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('notification_rules')
            .select('id, scope, nutritionist_id, rule_key, weight, config, is_active, updated_at')
            .eq('scope', 'feed_priority')
            .eq('is_active', true)
            .or(`nutritionist_id.is.null,nutritionist_id.eq.${nutritionistId}`)
            .order('nutritionist_id', { ascending: true })
            .order('weight', { ascending: false });

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_regras_de_prioridade_do_feed", error);
        return { data: [], error };
    }
};
