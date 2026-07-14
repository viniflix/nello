import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
    getPatientSummary,
    getPatientActivities
} from '@/lib/supabase/patient-queries';
import {
    getPatientRecordFoundation,
    listPatientLegalGuardians
} from '@/features/clinical-records/api/record-foundation-queries';
import { getContextualProfileRequirements } from '@/features/clinical-records/model/progressiveProfileSchema';

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
 * Hook customizado para gerenciar dados do Hub do Paciente
 * @param {string} patientId - ID do paciente
 * @returns {object} - Objeto com dados e funções do hub
 */
export const usePatientHub = (patientId) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [patientData, setPatientData] = useState(null);
    const [loadedPatientId, setLoadedPatientId] = useState(null);
    const [latestMetrics, setLatestMetrics] = useState(null);
    const [modulesStatus, setModulesStatus] = useState({});
    const [activities, setActivities] = useState([]);
    const [activitiesLoading, setActivitiesLoading] = useState(false);
    const [foundation, setFoundation] = useState(null);
    const [viewedEpisodeId, setViewedEpisodeId] = useState(null);
    const [writableEpisodeId, setWritableEpisodeId] = useState(null);
    const [canWriteEpisode, setCanWriteEpisode] = useState(false);
    const [legalGuardians, setLegalGuardians] = useState([]);
    const [profileRequirements, setProfileRequirements] = useState([]);
    const requestGeneration = useRef(0);
    const activitiesGeneration = useRef(0);

    /**
     * Carrega o resumo completo do paciente
     */
    const loadPatientSummary = useCallback(async (isCancelled = () => false) => {
        if (!patientId || !user?.id) return;

        const generation = ++requestGeneration.current;
        const isLatestRequest = () => !isCancelled() && requestGeneration.current === generation;

        setLoading(true);
        setError(null);

        try {
            const [summaryResult, foundationResult] = await Promise.all([
                getPatientSummary(patientId, user.id),
                getPatientRecordFoundation(patientId)
            ]);
            if (!isLatestRequest()) return;
            const { data, error: summaryError } = summaryResult;

            if (summaryError) {
                throw summaryError;
            }

            if (data) {
                setPatientData(data.profile);
                setLoadedPatientId(patientId);
                setLatestMetrics(data.metrics);
                setModulesStatus(data.modulesStatus);

                const loadedFoundation = foundationResult.error ? null : foundationResult.data;
                setFoundation(loadedFoundation);
                const episodeContract = getEpisodeContract(loadedFoundation, data.profile);
                setViewedEpisodeId(episodeContract.viewedEpisodeId);
                setWritableEpisodeId(episodeContract.writableEpisodeId);
                setCanWriteEpisode(episodeContract.canWriteEpisode);
                let guardians = [];
                if (episodeContract.viewedEpisodeId) {
                    const guardiansResult = await listPatientLegalGuardians(patientId, episodeContract.viewedEpisodeId);
                    if (!isLatestRequest()) return;
                    if (!guardiansResult.error) guardians = guardiansResult.data || [];
                }
                setLegalGuardians(guardians);

                const profile = loadedFoundation?.patient || data.profile || {};
                const ageStatus = getPatientAgeStatus(profile.birth_date);
                setProfileRequirements(getContextualProfileRequirements(profile, {
                    isMinor: ageStatus === 'minor',
                    ageBasedProtocol: ageStatus === 'unknown',
                    legalGuardians: guardians
                }));
            } else {
                setError(new Error('Paciente não encontrado'));
            }
        } catch (err) {
            if (!isLatestRequest()) return;
            console.error('Erro ao carregar resumo do paciente:', err);
            setError(err);
            setPatientData(null);
            setLoadedPatientId(null);
            setFoundation(null);
            setViewedEpisodeId(null);
            setWritableEpisodeId(null);
            setCanWriteEpisode(false);
            setLegalGuardians([]);
            setProfileRequirements([]);
        } finally {
            if (isLatestRequest()) setLoading(false);
        }
    }, [patientId, user?.id]);

    /**
     * Carrega as atividades do paciente
     * Busca TODAS as atividades disponíveis para permitir filtros client-side
     */
    const loadActivities = useCallback(async (isCancelled = () => false) => {
        if (!patientId) return;

        const generation = ++activitiesGeneration.current;
        const isLatestRequest = () => !isCancelled() && activitiesGeneration.current === generation;

        setActivitiesLoading(true);

        try {
            // Buscar até 100 atividades para permitir filtros de período funcionarem
            const { data, error: activitiesError } = await getPatientActivities(
                patientId,
                100
            );

            if (activitiesError) {
                throw activitiesError;
            }

            if (isLatestRequest()) setActivities(data || []);
        } catch (err) {
            if (!isLatestRequest()) return;
            console.error('Erro ao carregar atividades:', err);
            setActivities([]);
        } finally {
            if (isLatestRequest()) setActivitiesLoading(false);
        }
    }, [patientId]);

    /**
     * Recarrega todos os dados
     */
    const refresh = useCallback(async () => {
        await Promise.all([
            loadPatientSummary(),
            loadActivities()
        ]);
    }, [loadPatientSummary, loadActivities]);

    // Carrega os dados iniciais (ou define loading=false quando não há patientId)
    useEffect(() => {
        let cancelled = false;
        requestGeneration.current += 1;
        activitiesGeneration.current += 1;
        setPatientData(null);
        setLoadedPatientId(null);
        setLatestMetrics(null);
        setModulesStatus({});
        setFoundation(null);
        setViewedEpisodeId(null);
        setWritableEpisodeId(null);
        setCanWriteEpisode(false);
        setLegalGuardians([]);
        setProfileRequirements([]);
        setActivities([]);
        setActivitiesLoading(false);
        if (!patientId || !user?.id) {
            setLoading(false);
            return () => { cancelled = true; };
        }
        setLoading(true);
        loadPatientSummary(() => cancelled);
        return () => {
            cancelled = true;
            requestGeneration.current += 1;
            activitiesGeneration.current += 1;
        };
    }, [loadPatientSummary, patientId, user?.id]);

    // Carrega atividades (opcionalmente, pode ser lazy)
    useEffect(() => {
        let cancelled = false;
        if (patientData && loadedPatientId === patientId) {
            loadActivities(() => cancelled);
        }
        return () => {
            cancelled = true;
            activitiesGeneration.current += 1;
        };
    }, [loadedPatientId, patientData, patientId, loadActivities]);

    return {
        // Estados
        loading,
        error,
        patientData,
        latestMetrics,
        modulesStatus,
        activities,
        activitiesLoading,
        foundation,
        viewedEpisodeId,
        writableEpisodeId,
        canWriteEpisode,
        profileRequirements,
        legalGuardians,

        // Funções
        refresh,
        loadActivities
    };
};

export default usePatientHub;
