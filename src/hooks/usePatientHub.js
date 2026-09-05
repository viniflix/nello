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
        queryFn: async () => {
            if (!patientId || !user?.id) throw new Error('Credenciais inválidas');
            
            const [summaryResult, foundationResult, adherenceResult] = await Promise.all([
                getPatientSummary(patientId, user.id),
                getPatientRecordFoundation(patientId),
                calculateDiaryAdherence(patientId, 7)
            ]);
            
            if (summaryResult.error) throw summaryResult.error;
            
            const data = summaryResult.data;
            if (!data) throw new Error('Paciente não encontrado');

            const loadedFoundation = foundationResult.error ? null : foundationResult.data;
            const episodeContract = getEpisodeContract(loadedFoundation, data.profile);
            const operationalResult = await getPatientHubOperationalContext(patientId, user.id, episodeContract.viewedEpisodeId);
            
            let guardians = [];
            if (episodeContract.viewedEpisodeId) {
                const guardiansResult = await listPatientLegalGuardians(patientId, episodeContract.viewedEpisodeId);
                if (!guardiansResult.error) guardians = guardiansResult.data || [];
            }

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

            return {
                patientData: data.profile,
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
        },
        enabled: !!patientId && !!user?.id,
        staleTime: 1000 * 60 * 5, // 5 minutos de cache
    });

    const activitiesQuery = useQuery({
        queryKey: ['patient-hub-activities', patientId],
        queryFn: async () => {
            const { data, error } = await getPatientActivities(patientId, 100);
            if (error) {
                console.error('Erro ao carregar atividades:', error);
                return [];
            }
            return data || [];
        },
        enabled: !!patientId && !!summaryQuery.data,
        staleTime: 1000 * 60 * 5,
    });

    const refresh = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['patient-hub-summary', patientId] }),
            queryClient.invalidateQueries({ queryKey: ['patient-hub-activities', patientId] })
        ]);
    }, [queryClient, patientId]);

    const loadActivities = useCallback(() => {
        activitiesQuery.refetch();
    }, [activitiesQuery]);

    return {
        // Estados
        loading: summaryQuery.isLoading, // true apenas no primeiro carregamento sem cache
        error: summaryQuery.error,
        patientData: summaryQuery.data?.patientData || null,
        latestMetrics: summaryQuery.data?.latestMetrics || null,
        modulesStatus: summaryQuery.data?.modulesStatus || {},
        activities: activitiesQuery.data || [],
        activitiesLoading: activitiesQuery.isLoading,
        foundation: summaryQuery.data?.foundation || null,
        viewedEpisodeId: summaryQuery.data?.viewedEpisodeId || null,
        writableEpisodeId: summaryQuery.data?.writableEpisodeId || null,
        canWriteEpisode: summaryQuery.data?.canWriteEpisode || false,
        profileRequirements: summaryQuery.data?.profileRequirements || [],
        legalGuardians: summaryQuery.data?.legalGuardians || [],
        operationalContext: summaryQuery.data?.operationalContext || null,
        adherence: summaryQuery.data?.adherence || null,
        insights: summaryQuery.data?.insights || null,

        // Funções
        refresh,
        loadActivities
    };
};

export default usePatientHub;
