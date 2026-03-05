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

/**
 * Busca templates do nutricionista + templates padrão (nutritionist_id null).
 * Se existir cópia do nutricionista com o mesmo template_key do padrão, só a cópia aparece.
 */
export const getMessageTemplates = async ({
    nutritionistId,
    context = null,
    isActive = null,
    limit = 80
} = {}) => {
    try {
        let query = supabase
            .from('message_templates')
            .select('*')
            .or(`nutritionist_id.eq.${nutritionistId},nutritionist_id.is.null`)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (context) query = query.eq('context', context);
        if (isActive !== null) query = query.eq('is_active', isActive);

        const { data, error } = await query;
        if (error) throw error;
        const raw = data || [];

        // Por template_key: priorizar template do nutricionista sobre o padrão
        const byKey = new Map();
        raw.forEach((row) => {
            const key = row.template_key;
            const existing = byKey.get(key);
            if (!existing || (row.nutritionist_id && !existing.nutritionist_id)) {
                byKey.set(key, row);
            }
        });
        const merged = Array.from(byKey.values()).sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );

        return { data: merged, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar templates de mensagem', error);
        return { data: [], error };
    }
};

/**
 * Duplica um template padrão (nutritionist_id null) para o nutricionista.
 * Se já existir cópia com o mesmo template_key, retorna a existente.
 * Usado em "Duplicar e editar" para que a edição não altere o padrão para outros.
 */
export const copyDefaultTemplate = async ({ defaultTemplateId, nutritionistId }) => {
    try {
        const { data: defaultTpl, error: fetchErr } = await supabase
            .from('message_templates')
            .select('*')
            .eq('id', defaultTemplateId)
            .is('nutritionist_id', null)
            .single();

        if (fetchErr || !defaultTpl) {
            return { data: null, error: fetchErr || new Error('Template padrão não encontrado') };
        }

        const { data: existing } = await supabase
            .from('message_templates')
            .select('id')
            .eq('nutritionist_id', nutritionistId)
            .eq('template_key', defaultTpl.template_key)
            .maybeSingle();

        if (existing) {
            const { data: full } = await supabase
                .from('message_templates')
                .select('*')
                .eq('id', existing.id)
                .single();
            return { data: full, error: null };
        }

        return await createMessageTemplate({
            nutritionistId,
            templateKey:    defaultTpl.template_key,
            name:           defaultTpl.name,
            context:        defaultTpl.context,
            channel:        defaultTpl.channel,
            titleTemplate:  defaultTpl.title_template,
            bodyTemplate:   defaultTpl.body_template,
            variables:      defaultTpl.variables || [],
            metadata:       { copied_from_default_id: defaultTpl.id, ...(defaultTpl.metadata || {}) }
        });
    } catch (error) {
        logSupabaseError('Erro ao duplicar template padrão', error);
        return { data: null, error };
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
                patient:patient_id (name)
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
