import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

export const CHECKLIST_STATUS_LABELS = {
    pending:     'Pendente',
    in_progress: 'Em andamento',
    completed:   'Concluído',
    cancelled:   'Cancelado',
};

export const CHECKLIST_CATEGORY_LABELS = {
    planning:      'Planejamento',
    clinical:      'Clínico',
    nutrition:     'Nutrição',
    anthropometry: 'Antropometria',
    labs:          'Exames',
    lifestyle:     'Estilo de Vida',
};

// ─── Generate checklist via RPC ───────────────────────────────────────────────
export const generateConsultationChecklist = async ({
    nutritionistId,
    patientId,
    appointmentId = null,
    extraItems = []
}) => {
    try {
        const { data, error } = await supabase.rpc('generate_consultation_checklist', {
            p_nutritionist_id: nutritionistId,
            p_patient_id:      patientId,
            p_appointment_id:  appointmentId,
            p_extra_items:     Array.isArray(extraItems) ? extraItems : []
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao gerar checklist de consulta', error);
        return { data: null, error };
    }
};

// ─── Fetch a single checklist (by id) ────────────────────────────────────────
export const getChecklistById = async (checklistId) => {
    try {
        const { data, error } = await supabase
            .from('consultation_checklists')
            .select('*')
            .eq('id', checklistId)
            .maybeSingle();

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar checklist', error);
        return { data: null, error };
    }
};

// ─── Fetch checklists for a patient (history) ────────────────────────────────
export const getPatientChecklists = async ({
    nutritionistId,
    patientId,
    status = null,
    limit = 20
} = {}) => {
    try {
        let query = supabase
            .from('consultation_checklists')
            .select('*')
            .eq('nutritionist_id', nutritionistId)
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (status) query = query.eq('status', status);

        const { data, error } = await query;
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar checklists do paciente', error);
        return { data: [], error };
    }
};

// ─── Get the most recent active checklist for a patient ──────────────────────
export const getLatestActiveChecklist = async ({ nutritionistId, patientId }) => {
    try {
        const { data, error } = await supabase
            .from('consultation_checklists')
            .select('*')
            .eq('nutritionist_id', nutritionistId)
            .eq('patient_id', patientId)
            .in('status', ['pending', 'in_progress'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar checklist ativo', error);
        return { data: null, error };
    }
};

// ─── Toggle a single item via RPC ────────────────────────────────────────────
export const updateChecklistItem = async ({ checklistId, itemId, done }) => {
    try {
        const { data, error } = await supabase.rpc('update_checklist_item', {
            p_checklist_id: checklistId,
            p_item_id:      itemId,
            p_done:         Boolean(done)
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar item do checklist', error);
        return { data: null, error };
    }
};

// ─── Cancel a checklist ───────────────────────────────────────────────────────
export const cancelChecklist = async ({ checklistId, nutritionistId }) => {
    try {
        const { data, error } = await supabase
            .from('consultation_checklists')
            .update({ status: 'cancelled' })
            .eq('id', checklistId)
            .eq('nutritionist_id', nutritionistId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao cancelar checklist', error);
        return { data: null, error };
    }
};

// ─── Compute summary metrics from a checklist record ─────────────────────────
export const computeChecklistProgress = (checklist) => {
    if (!checklist) return { percent: 0, done: 0, total: 0 };
    const total = checklist.total_items || 0;
    const done  = checklist.completed_items || 0;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { percent, done, total };
};
