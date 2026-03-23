import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export const logOperationalEvent = async ({
    module,
    operation,
    eventType = 'success',
    latencyMs = 0,
    nutritionistId = null,
    patientId = null,
    errorMessage = null,
    metadata = {}
} = {}) => {
    try {
        const { data, error } = await supabase.rpc('log_operational_event', {
            p_module: module,
            p_operation: operation,
            p_event_type: eventType,
            p_latency_ms: Math.max(0, Number(latencyMs || 0)),
            p_nutritionist_id: nutritionistId,
            p_patient_id: patientId,
            p_error_message: errorMessage,
            p_metadata: metadata && typeof metadata === 'object' ? metadata : {}
        });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao registrar evento operacional', error);
        return { data: null, error };
    }
};

export const getOperationalHealthSummary = async ({
    nutritionistId = null,
    windowHours = 24
} = {}) => {
    try {
        const { data, error } = await supabase.rpc('get_operational_health_summary', {
            p_nutritionist_id: nutritionistId,
            p_window_hours: Math.max(1, Number(windowHours || 24))
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar resumo de observabilidade operacional', error);
        return { data: null, error };
    }
};

export const getOperationalErrorEvents = async ({
    module = 'client',
    windowHours = 24,
    limit = 30
} = {}) => {
    try {
        const since = new Date(Date.now() - Math.max(1, Number(windowHours || 24)) * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('operational_observability_log')
            .select('id, module, operation, event_type, error_message, metadata, created_at, nutritionist_id, patient_id')
            .eq('event_type', 'error')
            .eq('module', module)
            .gte('created_at', since)
            .order('created_at', { ascending: false })
            .limit(Math.max(1, Number(limit || 30)));

        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar eventos de erro', error);
        return { data: null, error };
    }
};
