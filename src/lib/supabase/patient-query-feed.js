import { idempotentRpc } from '@/lib/supabase/idempotent-mutations';

import { communicationClient as supabase } from '@/infrastructure/supabase/domainClients';

import { logSupabaseError } from '@/lib/supabase/query-helpers';


import { retryNetworkRead } from '@/lib/supabase/readRetry';
import { scopeFeedItems } from './feed-scope';

import {getActivityCtaRoute} from './patient-query-history';
export const buildFeedTaskIdentity = ({ nutritionistId, sourceType, sourceId }) => {
    return {
        nutritionist_id: nutritionistId,
        source_type: sourceType,
        source_id: sourceId
    };
};

export const ownsCurrentSession = async (expectedUserId) => {
    if (!expectedUserId) return false;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data?.session?.user?.id === expectedUserId;
};

export const sessionChangedDuringWrite = async (error, expectedUserId) => {
    if (error?.code === 'SESSION_CHANGED') return true;
    if (!['PGRST116','42501'].includes(error?.code)) return false;
    try {
        return !await ownsCurrentSession(expectedUserId);
    } catch {
        return false;
    }
};

export const getFeedTaskStates = async (nutritionistId) => {
    try {
        if (!await ownsCurrentSession(nutritionistId)) return { data: [], error: null, skipped: true };
        const { data, error } = await supabase.rpc('get_my_feed_task_states');

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_estados_do_feed", error);
        return { data: [], error };
    }
};

export const getNutritionistPatientsForFeed = async (nutritionistId) => {
    try {
        if (!await ownsCurrentSession(nutritionistId)) return { data: [], error: null, skipped: true };
        const { data, error } = await retryNetworkRead(() => supabase.rpc('get_active_feed_patients'),
            () => ownsCurrentSession(nutritionistId));
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('erro_ao_buscar_pacientes_do_nutricionista_para_feed', error);
        return { data: [], error };
    }
};

// Retry the failed subset with fresh authorization and revision, never a new episode.
export const retryFeedTaskSync = async (nutritionistId, failedItems = []) => {
    const [patients, states] = await Promise.all([
        getNutritionistPatientsForFeed(nutritionistId), getFeedTaskStates(nutritionistId)
    ]);
    if (patients.skipped || states.skipped) return { data: [], error: null, skipped: true };
    if (patients.error || states.error) {
        const error = patients.error || states.error;
        return { data: [], error, failedItems: failedItems.map(item=>({...item, failureCode:error.code || null})) };
    }
    const eligible = scopeFeedItems(failedItems, patients.data, { preserveEpisode: true });
    const result = await syncFeedTasksFromItems(nutritionistId, eligible, states.data);
    return { ...result, discardedKeys: failedItems.filter(item=>!eligible.some(next=>
        next.sourceType===item.sourceType && next.sourceId===item.sourceId)).map(item=>
        item.sourceType+':'+item.sourceId) };
};

export const upsertFeedTask = async ({
    nutritionistId, patientId = null, sourceType, sourceId, title,
    description = null, priorityScore = 0, priorityReason = null,
    status = 'open', snoozeUntil = null, metadata = {}, auditAction = null,
    existingTask = undefined
}) => {
    try {
        if (!await ownsCurrentSession(nutritionistId)) return { data: null, error: null, skipped: true };
        const identity = buildFeedTaskIdentity({ nutritionistId, sourceType, sourceId });
        let existing = existingTask;
        if (existing === undefined) {
            const { data, error } = await supabase.from('feed_tasks').select('id, updated_at')
                .match(identity).eq('is_current', true).maybeSingle();
            if (error) throw error;
            existing = data;
        }
        const result = await idempotentRpc('save_feed_task', {
            p_values: { ...identity, patient_id: patientId, title, description,
                priority_score: Number(priorityScore || 0), priority_reason: priorityReason,
                status, snooze_until: snoozeUntil,
                metadata: { item_type: metadata?.item_type || null, cta_route: metadata?.cta_route || null,
                    care_episode_id: metadata?.care_episode_id || null }
            },
            p_expected: existing?.updated_at || null,
            p_action: auditAction
        });
        if (await sessionChangedDuringWrite(result.error, nutritionistId)) return { data: null, error: null, skipped: true };
        if (result.data?.no_longer_applicable) return { data: null, error: null, obsolete: true };
        if (result.error) logSupabaseError('erro_ao_salvar_tarefa_do_feed', result.error);
        return result;
    } catch (error) {
        logSupabaseError('erro_ao_salvar_tarefa_do_feed', error);
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
            obsoleteKeys: results.flatMap((result,index)=>result?.obsolete
                ? [`${inputs[index].sourceType}:${inputs[index].sourceId}`] : []),
            error: failed.length ? failed[0].error : null,
            failedCount: failed.length
        };
    } catch (error) {
        logSupabaseError("erro_ao_resolver_tarefas_em_lote", error);
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
        logSupabaseError("erro_ao_adiar_tarefas_em_lote", error);
        return { data: [], error, failedCount: (inputs || []).length };
    }
};

export const syncFeedTasksFromItems = async (nutritionistId, items = [], existingStates = []) => {
    try {
        if (!nutritionistId) {
            return { data: [], error: null };
        }

        if (!await ownsCurrentSession(nutritionistId)) {
            return { data: [], error: null, skipped: true };
        }

        const stateMap = new Map(
            (existingStates || []).map((state) => [`${state.source_type}:${state.source_id}`, state])
        );

        const syncPayloads = (items || [])
            .filter((item) => item?.sourceType && item?.sourceId)
            .map((item) => {
                const key = `${item.sourceType}:${item.sourceId}`;
                const candidate = stateMap.get(key);
                const existing = item.patientId && item.careEpisodeId
                    && candidate?.metadata?.care_episode_id !== item.careEpisodeId ? null : candidate;
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

                const payload = {
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
                        cta_route: item.ctaRoute || null,
                        care_episode_id: item.careEpisodeId || null
                    }
                };
                const unchanged = existing
                    && String(existing.patient_id || '') === String(payload.patientId || '')
                    && existing.title === payload.title
                    && (existing.description || null) === payload.description
                    && Number(existing.priority_score || 0) === payload.priorityScore
                    && (existing.priority_reason || null) === payload.priorityReason
                    && existing.status === payload.status
                    && (existing.snooze_until || null) === payload.snoozeUntil
                    && (existing.metadata?.item_type || null) === payload.metadata.item_type
                    && (existing.metadata?.cta_route || null) === payload.metadata.cta_route
                    && (existing.metadata?.care_episode_id || null) === payload.metadata.care_episode_id;
                return { payload, existing, unchanged, item };
            });

        const result = [];
        for (let offset = 0; offset < syncPayloads.length; offset += 4) {
            const batch = syncPayloads.slice(offset, offset + 4);
            result.push(...await Promise.all(batch.map(({ payload, existing, unchanged }) =>
                unchanged ? Promise.resolve({ data: existing, error: null }) : upsertFeedTask({ ...payload, existingTask: existing || null })
            )));
        }
        const outcomes = result.map((entry, index) => ({
            sourceType: syncPayloads[index].payload.sourceType,
            sourceId: syncPayloads[index].payload.sourceId,
            status: entry?.skipped ? 'skipped' : entry?.obsolete ? 'obsolete' : entry?.error ? 'failed' : 'saved',
            code: entry?.error?.code || null
        }));
        return { data: result.map((entry) => entry?.data).filter(Boolean),
            error: result.find((entry) => entry?.error)?.error || null,
            outcomes, failedItems: syncPayloads.flatMap(({item},index)=>outcomes[index].status==='failed'
                ? [{...item, failureCode: result[index]?.error?.code || null}] : []),
            failedCount: outcomes.filter((entry) => entry.status === 'failed').length };
    } catch (error) {
        logSupabaseError("erro_ao_sincronizar_snapshot_do_feed", error);
        return { data: [], error };
    }
};

export const getFeedTaskAuditTrail = async ({
    nutritionistId,
    sourceType,
    sourceId,
    limit = 10
}) => {
    try {
        const identity = buildFeedTaskIdentity({ nutritionistId, sourceType, sourceId });
        const { data: existingRows, error } = await supabase
            .from('feed_tasks')
            .select('id, status, snooze_until, updated_at, metadata')
            .match(identity)
            .order('updated_at', { ascending: false });
            
        const data = existingRows?.[0];

        if (error) throw error;
        if (!data) return { data: [], error: null };

        const entries = Array.isArray(data?.metadata?.audit_history) ? data.metadata.audit_history : [];
        return { data: entries.slice(0, Math.max(1, Number(limit) || 10)), error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_auditoria_do_item_do_feed", error);
        return { data: [], error };
    }
};

export const ACTIVITY_FEED_CACHE_TTL_MS = 45000;

let activityFeedCacheEpoch = 0;
export const clearActivityFeedCache = () => {
    activityFeedCacheEpoch += 1;
    activityFeedCache = { key: null, data: null, ts: 0 };
};
export let activityFeedCache = { key: null, data: null, ts: 0 };

export const getComprehensiveActivityFeed = async (nutritionistId, limit = 20) => {
    const epoch = activityFeedCacheEpoch;
    const cacheKey = `${nutritionistId}:${limit}`;
    if (activityFeedCache.key === cacheKey && (Date.now() - activityFeedCache.ts) < ACTIVITY_FEED_CACHE_TTL_MS) {
        return { data: activityFeedCache.data, error: null };
    }

    try {
        // OTIMIZADO: Usa função SQL que consolida 8 queries em 1
        const { data, error } = await supabase
            .rpc('get_comprehensive_activity_feed_optimized', {
                p_nutritionist_id: nutritionistId,
                p_limit: limit
            });

        if (error) throw error;

        // Buscar avatares e slugs dos pacientes (cache-friendly)
        const patientIds = [...new Set(data?.map(a => a.patient_id) || [])];
        const { data: patientsData } = await supabase
            .from('user_profiles')
            .select('id, avatar_url, slug')
            .in('id', patientIds);

        const avatarMap = Object.fromEntries((patientsData || []).map(p => [p.id, p.avatar_url]));
        const slugMap = Object.fromEntries((patientsData || []).map(p => [p.id, p.slug]).filter(([, s]) => s));

        // Transformar resultado SQL para formato compatível com código existente
        const activities = (data || []).map(activity => {
            const cta = getActivityCtaRoute({
                type: activity.activity_type,
                patient_id: activity.patient_id,
                patient_slug: slugMap[activity.patient_id]
            });
            const baseActivity = {
                id: `${activity.activity_type}-${activity.activity_id}`,
                type: activity.activity_type,
                patient_id: activity.patient_id,
                patient_slug: slugMap[activity.patient_id] || null,
                patient_name: activity.patient_name,
                patient_avatar: avatarMap[activity.patient_id] || null,
                timestamp: activity.activity_date,
                metadata: activity.activity_data,
                cta: { label: cta.label, route: cta.route },
                ctaLabel: cta.label,
                ctaRoute: cta.route
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
                case 'progress_photo': {
                    const action = activity.activity_data?.action || '';
                    const label = action === 'progress_photo.added' ? 'Foto adicionada' : action === 'progress_photo.edited' ? 'Foto editada' : 'Foto removida';
                    return {
                        ...baseActivity,
                        title: label,
                        description: 'Foto de progresso'
                    };
                }
                case 'energy_expenditure':
                    return {
                        ...baseActivity,
                        title: 'Cálculo energético realizado',
                        description: activity.activity_data?.final_kcal != null ? `${activity.activity_data.final_kcal} kcal planejadas` : 'Gastos energéticos calculados'
                    };
                default:
                    return baseActivity;
            }
        });

        /* logOperationalEvent removed */

        if (epoch === activityFeedCacheEpoch) activityFeedCache = { key: cacheKey, data: activities, ts: Date.now() };
        return { data: activities, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_feed_de_atividades", error);
        /* logOperationalEvent removed */
        return { data: [], error };
    }
};

export const resolveRuleWeight = (rules = [], ruleKey, fallbackWeight) => {
    const rule = rules.find((item) => item.rule_key === ruleKey && item.is_active !== false);
    return Number(rule?.weight ?? fallbackWeight);
};

export const resolveRuleConfig = (rules = [], ruleKey) => {
    const rule = rules.find((item) => item.rule_key === ruleKey && item.is_active !== false);
    return (rule?.config && typeof rule.config === 'object') ? rule.config : {};
};

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
