import { supabase } from '@/lib/customSupabaseClient';
import { translateMealType } from '@/utils/mealTranslations';
import { buildActivityEventPayload, logSupabaseError } from '@/lib/supabase/query-helpers';
import { classifyLabResultsRiskBatch, getLabRiskRules } from '@/lib/supabase/lab-results-queries';
import { logOperationalEvent } from './observability-queries';

/**
 * Busca o perfil completo do paciente
 * @param {string} patientId - ID do paciente
 * @param {string} nutritionistId - ID do nutricionista (para validação de RLS)
 * @returns {Promise<{data: object, error: object}>}
 */
export const getPatientProfile = async (patientId, nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', patientId)
            .eq('nutritionist_id', nutritionistId)
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar perfil do paciente', error);
        return { data: null, error };
    }
};

/**
 * Busca as últimas métricas do paciente (peso, altura, etc.)
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getLatestMetrics = async (patientId) => {
    try {
        // Buscar último registro de peso e altura do growth_records
        const { data: growthData, error: growthError } = await supabase
            .from('growth_records')
            .select('weight, height, record_date')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Se não encontrar em growth_records, buscar em user_profiles como fallback
        let weight = growthData?.weight;
        let height = growthData?.height;

        if (!weight || !height) {
            const { data: profileData } = await supabase
                .from('user_profiles')
                .select('weight, height')
                .eq('id', patientId)
                .single();

            weight = weight || profileData?.weight;
            height = height || profileData?.height;
        }

        // Buscar última consulta
        const { data: lastAppointment, error: lastAppError } = await supabase
            .from('appointments')
            .select('start_time, status')
            .eq('patient_id', patientId)
            .lte('start_time', new Date().toISOString())
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Buscar próxima consulta
        const { data: nextAppointment, error: nextAppError } = await supabase
            .from('appointments')
            .select('start_time, status')
            .eq('patient_id', patientId)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(1)
            .maybeSingle();

        const metrics = {
            weight: weight || null,
            height: height || null,
            last_measurement: growthData?.record_date || null,
            last_appointment: lastAppointment
                ? new Date(lastAppointment.start_time).toLocaleDateString('pt-BR')
                : null,
            next_appointment: nextAppointment
                ? new Date(nextAppointment.start_time).toLocaleDateString('pt-BR')
                : null
        };

        return { data: metrics, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar métricas do paciente', error);
        return { data: null, error };
    }
};

/**
 * Busca o status de cada módulo do paciente
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getModulesStatus = async (patientId) => {
    try {
        // Verificar se tem anamnese
        const { data: anamneseData } = await supabase
            .from('anamnese_answers')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem avaliação antropométrica
        const { data: anthropometryData } = await supabase
            .from('growth_records')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem prescrição
        const { data: prescriptionData } = await supabase
            .from('prescriptions')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem refeições registradas (não deletadas)
        const { data: mealsData } = await supabase
            .from('meals')
            .select('id')
            .eq('patient_id', patientId)
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

        // Verificar se tem conquistas
        const { data: achievementsData } = await supabase
            .from('user_achievements')
            .select('id')
            .eq('user_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem gasto energético calculado
        const { data: energyData } = await supabase
            .from('energy_expenditure_calculations')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem exames laboratoriais
        const { data: labResultsData } = await supabase
            .from('lab_results')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        const status = {
            anamnese: anamneseData ? 'completed' : 'not_started',
            anthropometry: anthropometryData ? 'completed' : 'not_started',
            energy_expenditure: energyData ? 'completed' : 'not_started',
            meal_plan: prescriptionData ? 'completed' : 'not_started',
            food_diary: mealsData ? 'completed' : 'not_started',
            lab_results: labResultsData ? 'completed' : 'not_started',
            prescriptions: prescriptionData ? 'completed' : 'not_started',
            achievements: achievementsData ? 'completed' : 'not_started'
        };

        return { data: status, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar status dos módulos', error);
        return { data: null, error };
    }
};

/**
 * Busca atividades recentes do paciente
 * @param {string} patientId - ID do paciente
 * @param {number} limit - Número de atividades a buscar
 * @returns {Promise<{data: array, error: object}>}
 */
export const getPatientActivities = async (patientId, limit = 10) => {
    try {
        const activities = [];

        // Buscar auditoria de refeições (CREATE, UPDATE, DELETE)
        const { data: mealAuditData } = await supabase
            .from('meal_audit_log')
            .select('id, action, meal_type, details, created_at')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false })
            .limit(30);

        if (mealAuditData) {
            mealAuditData.forEach((audit) => {
                const totalCalories = audit.details?.total_calories || 0;
                const mealTypeTranslated = translateMealType(audit.meal_type);

                let title = '';
                let description = '';

                if (audit.action === 'create') {
                    title = 'Refeição Registrada';
                    description = `${mealTypeTranslated} - ${totalCalories} kcal`;
                } else if (audit.action === 'update') {
                    title = 'Refeição Editada';
                    description = `${mealTypeTranslated} - ${totalCalories} kcal`;
                } else if (audit.action === 'delete') {
                    title = 'Refeição Deletada';
                    description = `${mealTypeTranslated} - ${totalCalories} kcal`;
                }

                activities.push({
                    id: `audit-${audit.id}`,
                    type: 'meal',
                    title: title,
                    description: description,
                    timestamp: audit.created_at,
                    metadata: [mealTypeTranslated, `${totalCalories} kcal`, audit.action === 'create' ? 'Registrado' : audit.action === 'update' ? 'Editado' : 'Deletado']
                });
            });
        }

        // Buscar últimos registros de peso (aumentado para cobrir mais tempo)
        const { data: weightData } = await supabase
            .from('growth_records')
            .select('id, weight, height, record_date, created_at')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: false })
            .limit(20);

        if (weightData) {
            weightData.forEach((record) => {
                const imc = record.height
                    ? (record.weight / Math.pow(record.height / 100, 2)).toFixed(1)
                    : null;

                activities.push({
                    id: `weight-${record.id}`,
                    type: 'weight',
                    title: 'Peso Registrado',
                    description: `Peso: ${record.weight} kg`,
                    timestamp: record.created_at,
                    metadata: imc
                        ? [`${record.weight} kg`, `IMC: ${imc}`]
                        : [`${record.weight} kg`]
                });
            });
        }

        // Buscar conquistas (aumentado para cobrir mais tempo)
        const { data: achievementsData } = await supabase
            .from('user_achievements')
            .select('id, achievement_id, achieved_at, achievements(name)')
            .eq('user_id', patientId)
            .order('achieved_at', { ascending: false })
            .limit(15);

        if (achievementsData) {
            achievementsData.forEach((achievement) => {
                activities.push({
                    id: `achievement-${achievement.id}`,
                    type: 'achievement',
                    title: 'Conquista Desbloqueada',
                    description: achievement.achievements?.name || 'Nova conquista',
                    timestamp: achievement.achieved_at,
                    metadata: ['🏆 Conquista']
                });
            });
        }

        // Buscar consultas recentes (aumentado para cobrir mais tempo)
        const { data: appointmentsData } = await supabase
            .from('appointments')
            .select('id, start_time, status, notes')
            .eq('patient_id', patientId)
            .order('start_time', { ascending: false })
            .limit(15);

        if (appointmentsData) {
            appointmentsData.forEach((appointment) => {
                activities.push({
                    id: `appointment-${appointment.id}`,
                    type: 'appointment',
                    title: 'Consulta Realizada',
                    description: appointment.notes || 'Consulta de acompanhamento',
                    timestamp: appointment.start_time,
                    metadata: [appointment.status || 'Concluída']
                });
            });
        }

        // Ordenar todas as atividades por data
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Retornar apenas o limite solicitado
        return { data: activities.slice(0, limit), error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar atividades do paciente', error);
        return { data: [], error };
    }
};

/**
 * Busca resumo completo do paciente (profile + metrics + status)
 * @param {string} patientId - ID do paciente
 * @param {string} nutritionistId - ID do nutricionista
 * @returns {Promise<{data: object, error: object}>}
 */
export const getPatientSummary = async (patientId, nutritionistId) => {
    try {
        const [profileResult, metricsResult, statusResult] = await Promise.all([
            getPatientProfile(patientId, nutritionistId),
            getLatestMetrics(patientId),
            getModulesStatus(patientId)
        ]);

        if (profileResult.error) {
            throw profileResult.error;
        }

        return {
            data: {
                profile: profileResult.data,
                metrics: metricsResult.data || {},
                modulesStatus: statusResult.data || {}
            },
            error: null
        };
    } catch (error) {
        logSupabaseError('Erro ao buscar resumo do paciente', error);
        return { data: null, error };
    }
};

/**
 * Busca TODAS as atividades de todos os pacientes do nutricionista
 * Feed completo tipo rede social com: refeições, anamnese, planos, consultas, mensagens, etc.
 * @param {string} nutritionistId - ID do nutricionista
 * @param {number} limit - Número de atividades a buscar
 * @returns {Promise<{data: array, error: object}>}
 */
/**
 * Detecta pacientes com baixa adesão (sem registros nas últimas 24-48h)
 * @param {string} nutritionistId - ID do nutricionista
 * @returns {Promise<{data: array, error: object}>}
 */
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
        logSupabaseError('Erro ao detectar baixa adesão', error);
        return { data: [], error };
    }
};

/**
 * Detecta pacientes com dados essenciais pendentes
 * (anamnese, avaliação antropométrica, plano alimentar, cálculo de necessidades)
 * @param {string} nutritionistId - ID do nutricionista
 * @returns {Promise<{data: array, error: object}>}
 */
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
        logSupabaseError('Erro ao detectar pendências', error);
        return { data: [], error };
    }
};

/**
 * Busca alertas de exames com risco alto para pacientes de um nutricionista.
 * Consolida por paciente + marcador (último exame mais recente).
 */
export const getPatientsHighRiskLabAlerts = async ({
    nutritionistId,
    patientIds = [],
    daysWindow = 120
}) => {
    try {
        const scopedPatientIds = (patientIds || []).filter(Boolean);
        if (!nutritionistId || !scopedPatientIds.length) {
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
        logSupabaseError('Erro ao buscar alertas de risco laboratorial alto', error);
        return { data: [], error };
    }
};

/**
 * Busca regras de prioridade do feed (globais + específicas do nutricionista)
 * @param {string} nutritionistId - ID do nutricionista
 * @returns {Promise<{data: array, error: object}>}
 */
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
        logSupabaseError('Erro ao buscar regras de prioridade do feed', error);
        return { data: [], error };
    }
};

/**
 * Registra evento de atividade no contrato unificado de eventos
 * @param {object} eventInput - dados do evento
 * @returns {Promise<{data: string|null, error: object|null}>}
 */
export const logActivityEvent = async (eventInput) => {
    try {
        const normalized = buildActivityEventPayload(eventInput || {});

        const { data, error } = await supabase.rpc('log_activity_event', {
            p_event_name: normalized.event_name,
            p_event_version: normalized.event_version,
            p_source_module: normalized.source_module,
            p_patient_id: normalized.patient_id,
            p_nutritionist_id: normalized.nutritionist_id,
            p_payload: normalized.payload
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao registrar evento de atividade', error);
        return { data: null, error };
    }
};

const buildFeedTaskIdentity = ({ nutritionistId, sourceType, sourceId }) => {
    return {
        nutritionist_id: nutritionistId,
        source_type: sourceType,
        source_id: sourceId
    };
};

const pushFeedTaskAuditEntry = (metadata, entry) => {
    const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};
    const previous = Array.isArray(safeMetadata.audit_history) ? safeMetadata.audit_history : [];
    const nextHistory = [entry, ...previous].slice(0, 10);
    return {
        ...safeMetadata,
        audit_history: nextHistory,
        last_action: entry.action,
        last_action_at: entry.at
    };
};

/**
 * Busca estado persistido das tarefas do feed para o nutricionista
 * @param {string} nutritionistId
 * @returns {Promise<{data: array, error: object|null}>}
 */
export const getFeedTaskStates = async (nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('feed_tasks')
            .select('id, source_type, source_id, status, snooze_until, first_seen_at, created_at, updated_at, priority_score, priority_reason')
            .eq('nutritionist_id', nutritionistId);

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar estados do feed', error);
        return { data: [], error };
    }
};

/**
 * Busca pacientes vinculados ao nutricionista para cards auxiliares do feed
 * com fallback para schemas sem colunas legadas em user_profiles.
 */
export const getNutritionistPatientsForFeed = async (nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('id, name, birth_date, avatar_url')
            .eq('nutritionist_id', nutritionistId)
            .eq('is_active', true);

        if (!error) {
            return { data: data || [], error: null };
        }

        const { data: links, error: linksError } = await supabase
            .from('nutritionist_patients')
            .select('patient_id')
            .eq('nutritionist_id', nutritionistId);

        if (linksError) throw linksError;

        const patientIds = (links || []).map((link) => link.patient_id).filter(Boolean);
        if (!patientIds.length) {
            return { data: [], error: null };
        }

        const { data: profiles, error: profileError } = await supabase
            .from('user_profiles')
            .select('id, full_name, birth_date, avatar_url')
            .in('id', patientIds);

        if (profileError) throw profileError;

        const normalized = (profiles || []).map((profile) => ({
            id: profile.id,
            name: profile.full_name || 'Paciente',
            birth_date: profile.birth_date,
            avatar_url: profile.avatar_url
        }));

        return { data: normalized, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar pacientes do nutricionista para feed', error);
        return { data: [], error };
    }
};

/**
 * Salva/atualiza uma tarefa do feed de forma idempotente por fonte
 */
export const upsertFeedTask = async ({
    nutritionistId,
    patientId = null,
    sourceType,
    sourceId,
    title,
    description = null,
    priorityScore = 0,
    priorityReason = null,
    status = 'open',
    snoozeUntil = null,
    metadata = {},
    auditAction = null
}) => {
    try {
        const identity = buildFeedTaskIdentity({ nutritionistId, sourceType, sourceId });
        const { data: existing, error: existingError } = await supabase
            .from('feed_tasks')
            .select('id, metadata')
            .match(identity)
            .maybeSingle();

        if (existingError) throw existingError;

        const nowIso = new Date().toISOString();
        const baseMetadata = {
            ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
            ...(metadata && typeof metadata === 'object' ? metadata : {})
        };
        const metadataWithAudit = auditAction
            ? pushFeedTaskAuditEntry(baseMetadata, {
                action: auditAction,
                at: nowIso,
                nutritionist_id: nutritionistId || null,
                patient_id: patientId || null,
                source_type: sourceType || null,
                source_id: sourceId || null,
                status: status || 'open',
                snooze_until: snoozeUntil || null
            })
            : baseMetadata;

        const baseData = {
            ...identity,
            patient_id: patientId,
            title,
            description,
            priority_score: Number(priorityScore || 0),
            priority_reason: priorityReason,
            status,
            snooze_until: snoozeUntil,
            metadata: metadataWithAudit,
            last_seen_at: nowIso
        };

        if (status === 'resolved') {
            baseData.resolved_at = new Date().toISOString();
        } else {
            baseData.resolved_at = null;
        }

        if (existing?.id) {
            const { data, error } = await supabase
                .from('feed_tasks')
                .update(baseData)
                .eq('id', existing.id)
                .select()
                .single();
            if (error) throw error;
            return { data, error: null };
        }

        const insertData = {
            ...baseData,
            first_seen_at: new Date().toISOString()
        };
        const { data, error } = await supabase
            .from('feed_tasks')
            .insert(insertData)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao salvar tarefa do feed', error);
        return { data: null, error };
    }
};

export const resolveFeedTask = async (input) => {
    return upsertFeedTask({ ...input, status: 'resolved', snoozeUntil: null, auditAction: 'resolved' });
};

export const snoozeFeedTask = async (input) => {
    return upsertFeedTask({ ...input, status: 'snoozed', auditAction: 'snoozed' });
};

export const reopenFeedTask = async (input) => {
    return upsertFeedTask({ ...input, status: 'open', snoozeUntil: null, auditAction: 'reopened' });
};

export const resolveFeedTasksBatch = async (inputs = []) => {
    try {
        const operations = (inputs || []).map((input) =>
            upsertFeedTask({ ...input, status: 'resolved', snoozeUntil: null, auditAction: 'resolved_batch' })
        );
        const results = await Promise.all(operations);
        const failed = results.filter((result) => result?.error);
        return {
            data: results.map((result) => result?.data).filter(Boolean),
            error: failed.length ? failed[0].error : null,
            failedCount: failed.length
        };
    } catch (error) {
        logSupabaseError('Erro ao resolver tarefas em lote', error);
        return { data: [], error, failedCount: (inputs || []).length };
    }
};

export const snoozeFeedTasksBatch = async (inputs = [], snoozeUntil) => {
    try {
        const operations = (inputs || []).map((input) =>
            upsertFeedTask({ ...input, status: 'snoozed', snoozeUntil, auditAction: 'snoozed_batch' })
        );
        const results = await Promise.all(operations);
        const failed = results.filter((result) => result?.error);
        return {
            data: results.map((result) => result?.data).filter(Boolean),
            error: failed.length ? failed[0].error : null,
            failedCount: failed.length
        };
    } catch (error) {
        logSupabaseError('Erro ao adiar tarefas em lote', error);
        return { data: [], error, failedCount: (inputs || []).length };
    }
};

/**
 * Sincroniza snapshot atual do feed com feed_tasks.
 * Regras:
 * - resolved permanece resolved
 * - snoozed no futuro permanece snoozed
 * - snoozed expirado reabre como open
 * - sem estado prévio cria/atualiza como open
 */
export const syncFeedTasksFromItems = async (nutritionistId, items = [], existingStates = []) => {
    try {
        if (!nutritionistId) {
            return { data: [], error: null };
        }

        const stateMap = new Map(
            (existingStates || []).map((state) => [`${state.source_type}:${state.source_id}`, state])
        );

        const syncPayloads = (items || [])
            .filter((item) => item?.sourceType && item?.sourceId)
            .map((item) => {
                const key = `${item.sourceType}:${item.sourceId}`;
                const existing = stateMap.get(key);
                let nextStatus = 'open';
                let nextSnoozeUntil = null;

                if (existing?.status === 'resolved') {
                    nextStatus = 'resolved';
                } else if (existing?.status === 'snoozed') {
                    const dueAt = existing.snooze_until ? new Date(existing.snooze_until).getTime() : 0;
                    if (dueAt > Date.now()) {
                        nextStatus = 'snoozed';
                        nextSnoozeUntil = existing.snooze_until;
                    }
                }

                return {
                    nutritionistId,
                    patientId: item.patientId || null,
                    sourceType: item.sourceType,
                    sourceId: item.sourceId,
                    title: item.title || 'Item do feed',
                    description: item.description || null,
                    priorityScore: Number(item.priorityScore || 0),
                    priorityReason: item.priorityReason || null,
                    status: nextStatus,
                    snoozeUntil: nextSnoozeUntil,
                    metadata: {
                        item_type: item.type || null,
                        cta_route: item.ctaRoute || null
                    }
                };
            });

        const result = await Promise.all(syncPayloads.map((payload) => upsertFeedTask(payload)));
        const firstError = result.find((entry) => entry?.error)?.error || null;
        return { data: result.map((entry) => entry?.data).filter(Boolean), error: firstError };
    } catch (error) {
        logSupabaseError('Erro ao sincronizar snapshot do feed', error);
        return { data: [], error };
    }
};

/**
 * Retorna trilha operacional de auditoria por item do feed.
 */
export const getFeedTaskAuditTrail = async ({
    nutritionistId,
    sourceType,
    sourceId,
    limit = 10
}) => {
    try {
        const identity = buildFeedTaskIdentity({ nutritionistId, sourceType, sourceId });
        const { data, error } = await supabase
            .from('feed_tasks')
            .select('id, status, snooze_until, updated_at, metadata')
            .match(identity)
            .maybeSingle();

        if (error) throw error;
        if (!data) return { data: [], error: null };

        const entries = Array.isArray(data?.metadata?.audit_history) ? data.metadata.audit_history : [];
        return { data: entries.slice(0, Math.max(1, Number(limit) || 10)), error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar auditoria do item do feed', error);
        return { data: [], error };
    }
};

export const getComprehensiveActivityFeed = async (nutritionistId, limit = 20) => {
    const startedAt = Date.now();
    try {
        // OTIMIZADO: Usa função SQL que consolida 8 queries em 1
        const { data, error } = await supabase
            .rpc('get_comprehensive_activity_feed_optimized', {
                p_nutritionist_id: nutritionistId,
                p_limit: limit
            });

        if (error) throw error;

        // Buscar avatares dos pacientes (cache-friendly)
        const patientIds = [...new Set(data?.map(a => a.patient_id) || [])];
        const { data: patientsData } = await supabase
            .from('user_profiles')
            .select('id, avatar_url')
            .in('id', patientIds);

        const avatarMap = Object.fromEntries((patientsData || []).map(p => [p.id, p.avatar_url]));

        // Transformar resultado SQL para formato compatível com código existente
        const activities = (data || []).map(activity => {
            const baseActivity = {
                id: `${activity.activity_type}-${activity.activity_id}`,
                type: activity.activity_type,
                patient_id: activity.patient_id,
                patient_name: activity.patient_name,
                patient_avatar: avatarMap[activity.patient_id] || null,
                timestamp: activity.activity_date,
                metadata: activity.activity_data
            };

            // Adicionar título e descrição específicos por tipo
            switch (activity.activity_type) {
                case 'meal':
                    return {
                        ...baseActivity,
                        title: 'Refeição Registrada',
                        description: `${activity.activity_data.meal_type} - ${activity.activity_data.total_calories || 0} kcal`
                    };
                case 'anthropometry':
                    const imc = activity.activity_data.height && activity.activity_data.weight
                        ? (activity.activity_data.weight / Math.pow(activity.activity_data.height / 100, 2)).toFixed(1)
                        : null;
                    return {
                        ...baseActivity,
                        title: 'Peso Registrado',
                        description: `Peso: ${activity.activity_data.weight} kg${imc ? ` - IMC: ${imc}` : ''}`
                    };
                case 'anamnesis':
                    return {
                        ...baseActivity,
                        title: 'Anamnese Preenchida',
                        description: 'Anamnese completa'
                    };
                case 'meal_plan':
                    return {
                        ...baseActivity,
                        title: 'Plano Alimentar Criado',
                        description: activity.activity_data.name
                    };
                case 'prescription':
                    return {
                        ...baseActivity,
                        title: 'Prescrição Nutricional',
                        description: `${activity.activity_data.calories || ''} kcal`
                    };
                case 'appointment':
                    return {
                        ...baseActivity,
                        title: 'Consulta Agendada',
                        description: activity.activity_data.notes || 'Consulta de acompanhamento'
                    };
                case 'chat':
                    return {
                        ...baseActivity,
                        type: 'message',
                        title: 'Mensagem Recebida',
                        description: activity.activity_data.message_preview || 'Mensagem'
                    };
                case 'achievement':
                    return {
                        ...baseActivity,
                        title: 'Conquista Desbloqueada',
                        description: activity.activity_data.achievement_name || 'Nova conquista'
                    };
                default:
                    return baseActivity;
            }
        });

        await logOperationalEvent({
            module: 'feed',
            operation: 'get_comprehensive_activity_feed',
            eventType: 'success',
            latencyMs: Date.now() - startedAt,
            nutritionistId: nutritionistId || null,
            metadata: {
                items_count: activities.length
            }
        });

        return { data: activities, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar feed de atividades', error);
        await logOperationalEvent({
            module: 'feed',
            operation: 'get_comprehensive_activity_feed',
            eventType: 'error',
            latencyMs: Date.now() - startedAt,
            nutritionistId: nutritionistId || null,
            errorMessage: error?.message || String(error)
        });
        return { data: [], error };
    }
};

const resolveRuleWeight = (rules = [], ruleKey, fallbackWeight) => {
    const rule = rules.find((item) => item.rule_key === ruleKey && item.is_active !== false);
    return Number(rule?.weight ?? fallbackWeight);
};

const resolveRuleConfig = (rules = [], ruleKey) => {
    const rule = rules.find((item) => item.rule_key === ruleKey && item.is_active !== false);
    return (rule?.config && typeof rule.config === 'object') ? rule.config : {};
};

/**
 * Enriquecimento centralizado de prioridade para itens do feed.
 * Mantém a lógica de score fora da UI para facilitar evolução na Sprint 1.
 */
export const attachFeedPriorityMeta = (items = [], rules = []) => {
    return (items || []).map((item) => {
        if (item?.type === 'pending') {
            const baseScore = resolveRuleWeight(rules, 'pending_data', 5);
            const pendingType = String(item?.pendingType || '').toLowerCase();
            const criticalPendingTypes = ['prescription', 'anthropometry'];
            const extraScore = criticalPendingTypes.includes(pendingType) ? 1 : 0;
            return {
                ...item,
                priorityScore: baseScore + extraScore,
                priorityReason: extraScore > 0
                    ? 'Pendencia de dados essenciais (critica)'
                    : 'Pendencia de dados essenciais'
            };
        }

        if (item?.type === 'low_adherence') {
            const baseScore = resolveRuleWeight(rules, 'low_adherence', 4);
            const config = resolveRuleConfig(rules, 'low_adherence');
            const threshold = Number(config?.days_inactive_threshold ?? 2);
            const daysInactive = Number(item?.daysInactive ?? 0);
            let extraScore = 0;
            if (Number.isFinite(daysInactive)) {
                if (daysInactive >= threshold + 3) extraScore = 2;
                else if (daysInactive >= threshold + 1) extraScore = 1;
            }
            return {
                ...item,
                priorityScore: baseScore + extraScore,
                priorityReason: Number.isFinite(daysInactive) && daysInactive > 0
                    ? `Baixa adesao (${daysInactive} dias sem registro)`
                    : 'Baixa adesao recente'
            };
        }

        if (item?.type === 'appointment_upcoming' || item?.type === 'appointment') {
            const baseScore = resolveRuleWeight(rules, 'appointment_upcoming', 3);
            const appointmentDate = item?.timestamp ? new Date(item.timestamp) : null;
            const diffHours = appointmentDate && !Number.isNaN(appointmentDate.getTime())
                ? (appointmentDate.getTime() - Date.now()) / (1000 * 60 * 60)
                : null;
            let extraScore = 0;
            if (typeof diffHours === 'number') {
                if (diffHours <= 2) extraScore = 2;
                else if (diffHours <= 12) extraScore = 1;
            }
            return {
                ...item,
                priorityScore: baseScore + extraScore,
                priorityReason: extraScore >= 2 ? 'Consulta muito proxima' : 'Consulta proxima'
            };
        }

        if (item?.type === 'lab_high_risk') {
            return {
                ...item,
                priorityScore: resolveRuleWeight(rules, 'lab_high_risk', 5),
                priorityReason: 'Risco laboratorial alto'
            };
        }

        return {
            ...item,
            priorityScore: resolveRuleWeight(rules, 'recent_activity', 1),
            priorityReason: 'Atividade recente'
        };
    });
};

/**
 * Busca a última anamnese do paciente para extrair informações de atividade física
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getLatestAnamnesisForEnergy = async (patientId) => {
    try {
        // Buscar último registro de anamnese
        const { data: anamnesisRecord, error: recordError } = await supabase
            .from('anamnesis_records')
            .select('id, content, date')
            .eq('patient_id', patientId)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (recordError) throw recordError;

        if (!anamnesisRecord || !anamnesisRecord.content) {
            return { data: null, error: null };
        }

        // Tentar extrair informações de atividade física do conteúdo JSONB
        const content = anamnesisRecord.content;
        let exerciseFrequency = null;
        let activityLevel = null;

        // Buscar em diferentes campos possíveis
        if (typeof content === 'object') {
            // Tentar encontrar campos relacionados a exercício
            const searchFields = [
                'exercise_frequency',
                'exerciseFrequency',
                'frequencia_exercicio',
                'atividade_fisica',
                'physical_activity',
                'nivel_atividade',
                'activity_level'
            ];

            for (const field of searchFields) {
                if (content[field]) {
                    exerciseFrequency = content[field];
                    break;
                }
            }

            // Buscar em seções aninhadas
            if (!exerciseFrequency && content.sections) {
                for (const section of content.sections) {
                    if (section.fields) {
                        for (const field of section.fields) {
                            if (searchFields.includes(field.key || field.id)) {
                                exerciseFrequency = field.value || field.answer;
                                break;
                            }
                        }
                    }
                }
            }
        }

        return {
            data: {
                exerciseFrequency,
                activityLevel,
                date: anamnesisRecord.date
            },
            error: null
        };
    } catch (error) {
        logSupabaseError('Erro ao buscar anamnese para energia', error);
        return { data: null, error };
    }
};

/**
 * Busca o objetivo ativo do paciente para sugerir ajustes calóricos
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getActiveGoalForEnergy = async (patientId) => {
    try {
        const { data: goal, error } = await supabase
            .from('patient_goals')
            .select('id, goal_type, target_weight, current_weight, description, status')
            .eq('patient_id', patientId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        return { data: goal, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar objetivo para energia', error);
        return { data: null, error };
    }
};