import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

// ─── Known template contexts ─────────────────────────────────────────────────
export const TEMPLATE_CONTEXTS = [
    { value: 'general',              label: 'Geral' },
    { value: 'low_adherence',        label: 'Baixa Aderência' },
    { value: 'goal_achieved',        label: 'Meta Atingida' },
    { value: 'appointment_reminder', label: 'Lembrete de Consulta' },
    { value: 'no_show_followup',     label: 'Follow-up de Não Comparecimento' },
    { value: 'lab_alert',            label: 'Alerta de Exame' },
    { value: 'meal_plan_updated',    label: 'Plano Alimentar Atualizado' },
    { value: 'post_consultation',    label: 'Pós-Consulta' },
];

export const TEMPLATE_CHANNELS = [
    { value: 'in_app',    label: 'In-App' },
    { value: 'whatsapp',  label: 'WhatsApp' },
    { value: 'sms',       label: 'SMS' },
    { value: 'email',     label: 'E-mail' },
    { value: 'push',      label: 'Push' },
    { value: 'manual',    label: 'Manual' },
];

// ─── Known placeholder variables ─────────────────────────────────────────────
export const AVAILABLE_VARIABLES = [
    { key: '{{nome_paciente}}',  description: 'Nome do paciente' },
    { key: '{{email_paciente}}', description: 'E-mail do paciente' },
    { key: '{{data_hoje}}',      description: 'Data atual (DD/MM/AAAA)' },
    { key: '{{meta}}',           description: 'Meta atual do paciente' },
    { key: '{{prazo}}',          description: 'Prazo da meta' },
    { key: '{{progresso}}',      description: 'Progresso atual (%)' },
];

// ─── Validate placeholder syntax in a template body ──────────────────────────
export const validateTemplatePlaceholders = (body = '', title = '') => {
    const combined = `${title} ${body}`;
    const matches = combined.match(/\{\{([^}]+)\}\}/g) || [];
    const knownKeys = AVAILABLE_VARIABLES.map(v => v.key);
    const unknown = matches.filter(m => !knownKeys.includes(m));
    return { valid: unknown.length === 0, unknownPlaceholders: unknown };
};

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const getMessageTemplates = async ({
    nutritionistId,
    context = null,
    isActive = null,
    limit = 50
} = {}) => {
    try {
        let query = supabase
            .from('message_templates')
            .select('*')
            .eq('nutritionist_id', nutritionistId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (context) query = query.eq('context', context);
        if (isActive !== null) query = query.eq('is_active', isActive);

        const { data, error } = await query;
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar templates de mensagem', error);
        return { data: [], error };
    }
};

export const createMessageTemplate = async ({
    nutritionistId,
    templateKey,
    name,
    context = 'general',
    channel = 'in_app',
    titleTemplate = null,
    bodyTemplate,
    variables = [],
    metadata = {}
}) => {
    try {
        const { data, error } = await supabase
            .from('message_templates')
            .insert([{
                nutritionist_id: nutritionistId,
                template_key:    templateKey,
                name,
                context,
                channel,
                title_template:  titleTemplate,
                body_template:   bodyTemplate,
                variables:       Array.isArray(variables) ? variables : [],
                metadata:        metadata && typeof metadata === 'object' ? metadata : {}
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar template de mensagem', error);
        return { data: null, error };
    }
};

export const updateMessageTemplate = async ({
    templateId,
    nutritionistId,
    patch = {}
}) => {
    try {
        const allowed = ['name', 'context', 'channel', 'title_template', 'body_template',
                         'variables', 'is_active', 'metadata'];
        const safe = Object.fromEntries(
            Object.entries(patch).filter(([k]) => allowed.includes(k))
        );
        if (Object.keys(safe).length === 0) {
            return { data: null, error: new Error('Nenhum campo válido para atualizar') };
        }

        const { data, error } = await supabase
            .from('message_templates')
            .update(safe)
            .eq('id', templateId)
            .eq('nutritionist_id', nutritionistId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar template de mensagem', error);
        return { data: null, error };
    }
};

export const deleteMessageTemplate = async ({ templateId, nutritionistId }) => {
    try {
        const { error } = await supabase
            .from('message_templates')
            .delete()
            .eq('id', templateId)
            .eq('nutritionist_id', nutritionistId);

        if (error) throw error;
        return { data: true, error: null };
    } catch (error) {
        logSupabaseError('Erro ao excluir template de mensagem', error);
        return { data: false, error };
    }
};

export const toggleMessageTemplate = async ({ templateId, nutritionistId, isActive }) => {
    return updateMessageTemplate({
        templateId,
        nutritionistId,
        patch: { is_active: Boolean(isActive) }
    });
};

// ─── RPC: render preview locally (no DB call) ─────────────────────────────────
export const previewTemplate = ({ titleTemplate = '', bodyTemplate = '', variables = {} }) => {
    const defaults = {
        nome_paciente:  'João Silva',
        email_paciente: 'joao@email.com',
        data_hoje:      new Date().toLocaleDateString('pt-BR'),
        meta:           'Perder 5 kg',
        prazo:          '30/06/2026',
        progresso:      '65%',
        ...variables
    };

    let title = titleTemplate;
    let body  = bodyTemplate;

    Object.entries(defaults).forEach(([key, val]) => {
        const re = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        title = title.replace(re, val);
        body  = body.replace(re, val);
    });

    return { title, body };
};

// ─── RPC: dispatch via Supabase ───────────────────────────────────────────────
export const dispatchMessageTemplate = async ({
    templateId,
    patientId,
    triggerEvent = null,
    extraVariables = {}
}) => {
    try {
        const { data, error } = await supabase.rpc('dispatch_message_template', {
            p_template_id:     templateId,
            p_patient_id:      patientId,
            p_trigger_event:   triggerEvent,
            p_extra_variables: extraVariables && typeof extraVariables === 'object'
                ? extraVariables
                : {}
        });

        if (error) throw error;
        return { data: data || null, error: null };
    } catch (error) {
        logSupabaseError('Erro ao disparar template de mensagem', error);
        return { data: null, error };
    }
};

// ─── History ──────────────────────────────────────────────────────────────────
export const getTemplateDispatchHistory = async ({
    nutritionistId = null,
    patientId = null,
    templateId = null,
    limit = 30
} = {}) => {
    try {
        let query = supabase
            .from('template_dispatch_log')
            .select(`
                id, template_id, channel, trigger_event,
                rendered_title, rendered_body, delivery_status,
                created_at,
                message_templates (name, context),
                patient:patient_id (full_name)
            `)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (nutritionistId) query = query.eq('nutritionist_id', nutritionistId);
        if (patientId)      query = query.eq('patient_id', patientId);
        if (templateId)     query = query.eq('template_id', templateId);

        const { data, error } = await query;
        if (error) throw error;
        return { data: data || [], error: null };
    } catch (error) {
        if (error?.code === 'PGRST205') return { data: [], error: null };
        logSupabaseError('Erro ao buscar histórico de disparo de templates', error);
        return { data: [], error };
    }
};
