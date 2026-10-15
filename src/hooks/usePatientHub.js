import {queryRead} from '@/lib/utils/readPolicy';
import { queryResource } from '@/lib/utils/queryResource';
import { useQueryResource } from '@/hooks/useQueryResource';
import { settleResources, classifyFailure, failurePresentation } from '@/lib/utils/failure';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
    getPatientSummary,
    getPatientActivities,
    getPatientHubOperationalContext
} from '@/lib/supabase/patient-queries';
import { calculateDiaryAdherence } from '@/lib/supabase/food-diary-queries';
import {
    getPatientRecordFoundation,
    listPatientLegalGuardians
} from '@/features/clinical-records/api/record-foundation-queries';
import { getContextualProfileRequirements } from '@/features/clinical-records/model/progressiveProfileSchema';
import { buildPatientHubInsights } from '@/features/patient-hub/model/patientHubInsights';
import { Events, track } from '@/infrastructure/analytics/posthog';

export const getPatientAgeStatus = (birthDate, referenceDate = new Date()) => {
    if (typeof birthDate !== 'string') return 'unknown';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
    if (!match) return 'unknown';

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const birth = new Date(`${birthDate}T00:00:00`);
    if (Number.isNaN(birth.getTime())
        || birth.getFullYear() !== year
        || birth.getMonth() !== month - 1
        || birth.getDate() !== day
        || birth > referenceDate) return 'unknown';

    let age = referenceDate.getFullYear() - birth.getFullYear();
    if (referenceDate.getMonth() < birth.getMonth()
        || (referenceDate.getMonth() === birth.getMonth() && referenceDate.getDate() < birth.getDate())) age -= 1;
    return age < 18 ? 'minor' : 'adult';
};

const getEpisodeContract = (foundation, summaryProfile) => ({
    viewedEpisodeId: foundation?.viewed_episode_id || (!foundation ? summaryProfile?.care_episode_id : null) || null,
    writableEpisodeId: foundation?.can_write ? foundation?.writable_episode_id || null : null,
    canWriteEpisode: Boolean(foundation?.can_write && foundation?.writable_episode_id),
});

/**
 * Hook customizado para gerenciar dados do Hub do Paciente (Otimizado com React Query)
 * @param {string} patientId - ID do paciente
 * @returns {object} - Objeto com dados e funções do hub
 */
export const usePatientHub = (patientId) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();

    const summaryQuery = useQuery({
        queryKey: ['patient-hub-summary', patientId, user?.id],
        queryFn: queryRead(async ({signal}) => {
            if (!patientId || !user?.id) throw new Error('Credenciais inválidas');
            const started = performance.now();
            
            const { summary: summaryResult, foundation: foundationResult, adherence: adherenceResult } = await settleResources({
                summary: () => getPatientSummary(patientId, user.id, {signal}),
                foundation: () => getPatientRecordFoundation(patientId, {signal}),
                adherence: () => calculateDiaryAdherence(patientId, 7,{signal:signal})
            });
            for (const result of [summaryResult, foundationResult, adherenceResult]) {
                if (['forbidden', 'unauthenticated'].includes(classifyFailure(result.error))) throw result.error;
            }
            
            if (summaryResult.error) throw summaryResult.error;
            
            const data = summaryResult.data;
            if (!data) throw Object.assign(new Error('Paciente não encontrado'), { status: 404 });

            const loadedFoundation = foundationResult.error ? null : foundationResult.data;
            const episodeContract = getEpisodeContract(loadedFoundation, data.profile);
            const { operational: operationalResult, guardians: guardiansResult } = await settleResources({
                operational: () => getPatientHubOperationalContext(patientId, user.id, episodeContract.viewedEpisodeId,{signal:signal}),
                guardians: () => episodeContract.viewedEpisodeId
                    ? listPatientLegalGuardians(patientId, episodeContract.viewedEpisodeId, {signal})
                    : Promise.resolve({ data: [], error: null })
            });
            for (const result of [operationalResult, guardiansResult]) {
                if (['forbidden', 'unauthenticated'].includes(classifyFailure(result.error))) throw result.error;
            }
            const partialFailures = Object.fromEntries(Object.entries({ foundation: foundationResult, adherence: adherenceResult, operational: operationalResult, guardians: guardiansResult })
                .filter(([, result]) => result.error).map(([key, result]) => [key, failurePresentation(result.error)]));
            const guardians = guardiansResult.error ? [] : guardiansResult.data || [];

            const profile = loadedFoundation?.patient || data.profile || {};
            const ageStatus = getPatientAgeStatus(profile.birth_date);
            const profileRequirements = getContextualProfileRequirements(profile, {
                isMinor: ageStatus === 'minor',
                ageBasedProtocol: ageStatus === 'unknown',
                legalGuardians: guardians
            });
            const operationalContext = operationalResult.error || !operationalResult.data
                ? { planStatus: 'unknown', partialErrors: ['contexto do acompanhamento'] }
                : operationalResult.data;
            if (adherenceResult.error) {
                operationalContext.partialErrors = [...(operationalContext.partialErrors || []), 'regularidade do diário'];
            }
            const adherence = adherenceResult.error ? null : adherenceResult.data;
            const insights = buildPatientHubInsights({
                profileRequirements,
                operationalContext: operationalContext || {},
                latestMetrics: data.metrics,
                modulesStatus: data.modulesStatus,
                adherence
            });
            track(Events.DATA_LOAD_TIMING, { operation: 'patient_hub_summary', duration_ms: Math.round(performance.now() - started) });

            return {
                partialFailures, patientData: data.profile,
                latestMetrics: data.metrics,
                modulesStatus: data.modulesStatus,
                foundation: loadedFoundation,
                viewedEpisodeId: episodeContract.viewedEpisodeId,
                writableEpisodeId: episodeContract.writableEpisodeId,
                canWriteEpisode: episodeContract.canWriteEpisode,
                legalGuardians: guardians,
                profileRequirements,
                operationalContext,
                adherence,
                insights
            };
        }),
        enabled: !!patientId && !!user?.id,
        staleTime: 1000 * 60 * 5, // 5 minutos de cache
    });

    const activitiesQuery = useQuery({
        queryKey: ['patient-hub-activities', patientId, user?.id, summaryQuery.data?.viewedEpisodeId],
        queryFn: queryRead(async ({signal}) => {
            const started = performance.now();
            const { data, error } = await getPatientActivities(patientId, 100, {signal});
            if (error) {
                logDiagnostic('error', 'hooks/usePatientHub.js:130', 'Erro ao carregar atividades:', error);
                throw error;
            }
            track(Events.DATA_LOAD_TIMING, { operation: 'patient_hub_activities', duration_ms: Math.round(performance.now() - started), result_count: data?.length || 0 });
            return data || [];
        }),
        enabled: !!patientId && !!summaryQuery.data && !['forbidden','unauthenticated'].includes(classifyFailure(summaryQuery.error)),
        staleTime: 1000 * 60 * 5,
    });

    const refresh = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['patient-hub-summary', patientId] }),
            queryClient.invalidateQueries({ queryKey: ['patient-hub-activities', patientId] })
        ]);
    }, [queryClient, patientId]);

    const loadActivities = useCallback(() => {
        return activitiesQuery.refetch();
    }, [activitiesQuery]);

    const summaryResource = useQueryResource(summaryQuery, JSON.stringify([user?.id,patientId,'summary']));
    const activitySnapshot = useQueryResource(activitiesQuery, JSON.stringify([user?.id,patientId,summaryQuery.data?.viewedEpisodeId,'activities']), []);
    const activitiesResource = ['forbidden','unauthenticated'].includes(summaryResource.error?.kind)
        ? {...queryResource(activitiesQuery,[]),data:[],hasSnapshot:false,error:summaryResource.error,canAct:false}
        : activitySnapshot;
    const summary = summaryResource.data;
    return {
        summaryResource, activitiesResource, partialFailures: summary?.partialFailures || {},
        // Estados
        loading: summaryResource.initialLoading, // true apenas no primeiro carregamento sem cache
        error: summaryQuery.error,
        patientData: summary?.patientData || null,
        latestMetrics: summary?.latestMetrics || null,
        modulesStatus: summary?.modulesStatus || {},
        activities: activitiesResource.data,
        activitiesLoading: activitiesResource.initialLoading,
        foundation: summary?.foundation || null,
        viewedEpisodeId: summary?.viewedEpisodeId || null,
        writableEpisodeId: summary?.writableEpisodeId || null,
        canWriteEpisode: Boolean(summaryResource.canAct && summary?.canWriteEpisode && !summary?.partialFailures?.foundation && !summary?.partialFailures?.guardians),
        profileRequirements: summary?.profileRequirements || [],
        legalGuardians: summary?.legalGuardians || [],
        operationalContext: summary?.operationalContext || null,
        adherence: summary?.adherence || null,
        insights: summary?.insights || null,

        // Funções
        refresh,
        loadActivities
    };
};

export default usePatientHub;
