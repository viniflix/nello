import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
    getPatientSummary,
    getPatientActivities
} from '@/lib/supabase/patient-queries';

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

    /**
     * Carrega o resumo completo do paciente
     */
    const loadPatientSummary = useCallback(async () => {
        if (!patientId || !user?.id) return;

        setLoading(true);
        setError(null);

        try {
            const { data, error: summaryError } = await getPatientSummary(
                patientId,
                user.id
            );

            if (summaryError) {
                throw summaryError;
            }

            if (data) {
                setPatientData(data.profile);
                setLatestMetrics(data.metrics);
                setModulesStatus(data.modulesStatus);
            } else {
                setError(new Error('Paciente não encontrado'));
            }
        } catch (err) {
            console.error('Erro ao carregar resumo do paciente:', err);
            setError(err);
            setPatientData(null);
        } finally {
            setLoading(false);
        }
    }, [patientId, user?.id]);

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

    // Carrega os dados iniciais
    useEffect(() => {
        loadPatientSummary();
    }, [loadPatientSummary]);

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

        // Funções
        refresh,
        loadActivities
    };
};

export default usePatientHub;
