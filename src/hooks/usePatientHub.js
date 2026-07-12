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

const isPatientMinor = (birthDate) => {
    if (!birthDate) return false;
    const birth = new Date(`${birthDate}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth()
        || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
    return age < 18;
};

const getFoundationEpisodeId = (foundation, summaryProfile) => foundation?.active_episode?.id
    || foundation?.active_episode_id
    || foundation?.records?.[0]?.care_episode_id
    || summaryProfile?.care_episode_id
    || null;

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
    const [latestMetrics, setLatestMetrics] = useState(null);
    const [modulesStatus, setModulesStatus] = useState({});
    const [activities, setActivities] = useState([]);
    const [activitiesLoading, setActivitiesLoading] = useState(false);
    const [foundation, setFoundation] = useState(null);
    const [legalGuardians, setLegalGuardians] = useState([]);
    const [profileRequirements, setProfileRequirements] = useState([]);
    const requestGeneration = useRef(0);
    const mounted = useRef(true);

    /**
     * Carrega o resumo completo do paciente
     */
    const loadPatientSummary = useCallback(async () => {
        if (!patientId || !user?.id) return;

        const generation = ++requestGeneration.current;
        const isLatestRequest = () => mounted.current && requestGeneration.current === generation;

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
                setLatestMetrics(data.metrics);
                setModulesStatus(data.modulesStatus);

                const loadedFoundation = foundationResult.error ? null : foundationResult.data;
                setFoundation(loadedFoundation);
                const episodeId = getFoundationEpisodeId(loadedFoundation, data.profile);
                let guardians = [];
                if (episodeId) {
                    const guardiansResult = await listPatientLegalGuardians(patientId, episodeId);
                    if (!isLatestRequest()) return;
                    if (!guardiansResult.error) guardians = guardiansResult.data || [];
                }
                setLegalGuardians(guardians);

                const profile = loadedFoundation?.patient || data.profile || {};
                setProfileRequirements(getContextualProfileRequirements(profile, {
                    isMinor: isPatientMinor(profile.birth_date),
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
            setFoundation(null);
            setLegalGuardians([]);
            setProfileRequirements([]);
        } finally {
            if (isLatestRequest()) setLoading(false);
        }
    }, [patientId, user?.id]);

    useEffect(() => () => {
        mounted.current = false;
        requestGeneration.current += 1;
    }, []);

    /**
     * Carrega as atividades do paciente
     * Busca TODAS as atividades disponíveis para permitir filtros client-side
     */
    const loadActivities = useCallback(async () => {
        if (!patientId) return;

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

            setActivities(data || []);
        } catch (err) {
            console.error('Erro ao carregar atividades:', err);
            setActivities([]);
        } finally {
            setActivitiesLoading(false);
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
        if (!patientId || !user?.id) {
            setLoading(false);
            return;
        }
        loadPatientSummary();
        return () => {
            requestGeneration.current += 1;
        };
    }, [loadPatientSummary, patientId, user?.id]);

    // Carrega atividades (opcionalmente, pode ser lazy)
    useEffect(() => {
        if (patientData) {
            loadActivities();
        }
    }, [patientData, loadActivities]);

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
        profileRequirements,
        legalGuardians,

        // Funções
        refresh,
        loadActivities
    };
};

export default usePatientHub;
