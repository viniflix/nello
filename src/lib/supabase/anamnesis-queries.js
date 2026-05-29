import { supabase } from '@/lib/customSupabaseClient';
import { getTodayIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';
import { isUuid } from '@/lib/utils/patientRoutes';

/**
 * ============================================================
 * ANAMNESIS QUERIES
 * ============================================================
 * Funções para gerenciar templates e registros de anamnese
 */

// ============================================================
// TEMPLATES
// ============================================================

/**
 * Buscar todos os templates disponíveis para um nutricionista
 * Retorna templates do sistema + templates personalizados do nutricionista
 */
export const getAnamnesisTemplates = async (nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_templates')
            .select('*')
            .or(`is_system_default.eq.true,nutritionist_id.eq.${nutritionistId}`)
            .eq('is_active', true)
            .order('is_system_default', { ascending: false })
            .order('title', { ascending: true });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar templates de anamnese', error);
        return { data: null, error };
    }
};

/**
 * Buscar template específico por ID
 */
export const getTemplateById = async (templateId) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_templates')
            .select('*')
            .eq('id', templateId)
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar template', error);
        return { data: null, error };
    }
};

/**
 * Criar template personalizado
 */
export const createCustomTemplate = async (templateData) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_templates')
            .insert([{
                nutritionist_id: templateData.nutritionistId,
                title: templateData.title,
                description: templateData.description,
                sections: templateData.sections,
                is_system_default: false,
                is_active: true
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar template', error);
        return { data: null, error };
    }
};

// ============================================================
// ANAMNESIS RECORDS
// ============================================================

/**
 * Buscar todas as anamneses de um paciente
 * Ordenado por data (mais recente primeiro)
 */
export const getPatientAnamnesisList = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_records')
            .select(`
                id,
                date,
                version,
                status,
                notes,
                created_at,
                updated_at,
                template:anamnesis_templates(title)
            `)
            .eq('patient_id', patientId)
            .order('date', { ascending: false })
            .order('version', { ascending: false });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar anamneses do paciente', error);
        return { data: null, error };
    }
};

/**
 * Resolve short code (8 chars) ou UUID para o ID real da anamnese
 * @param {string} patientId - ID do paciente
 * @param {string} slugOrId - Short code (8 hex chars) ou UUID completo
 * @returns {Promise<{anamnesisId: string|null, error: object|null}>}
 */
export const resolveAnamnesisId = async (patientId, slugOrId) => {
  if (!patientId || !slugOrId) return { anamnesisId: null, error: null };
  if (isUuid(slugOrId)) return { anamnesisId: slugOrId, error: null };
  try {
    const shortCode = String(slugOrId).replace(/-/g, '').substring(0, 8).toLowerCase();
    const { data, error } = await supabase
      .from('anamnesis_records')
      .select('id')
      .eq('patient_id', patientId);
    if (error) throw error;
    const match = (data || []).find((r) =>
      String(r.id).replace(/-/g, '').toLowerCase().startsWith(shortCode)
    );
    return { anamnesisId: match?.id || null, error: null };
  } catch (err) {
    logSupabaseError('Erro ao resolver anamnese por short code', err);
    return { anamnesisId: null, error: err };
  }
};

/**
 * Buscar anamnese específica por ID (com conteúdo completo)
 */
export const getAnamnesisById = async (anamnesisId) => {
    try {
        // Buscar anamnese
        const { data: anamnesisData, error: anamnesisError } = await supabase
            .from('anamnesis_records')
            .select('*')
            .eq('id', anamnesisId)
            .single();

        if (anamnesisError) {
            logSupabaseError('Erro ao buscar anamnesis_records', anamnesisError);
            throw anamnesisError;
        }

        // Buscar template separadamente
        let templateData = null;
        if (anamnesisData.template_id) {
            const { data: template, error: templateError } = await supabase
                .from('anamnesis_templates')
                .select('id, title, sections')
                .eq('id', anamnesisData.template_id)
                .single();

            if (!templateError) {
                templateData = template;
            }
        }

        // Buscar paciente separadamente
        let patientData = null;
        if (anamnesisData.patient_id) {
            const { data: patient, error: patientError } = await supabase
                .from('user_profiles')
                .select('id, name')
                .eq('id', anamnesisData.patient_id)
                .single();

            if (!patientError) {
                patientData = patient;
            }
        }

        // Combinar dados
        const combinedData = {
            ...anamnesisData,
            template: templateData,
            patient: patientData
        };

        return { data: combinedData, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar anamnese', error);
        return { data: null, error };
    }
};

/**
 * Criar nova anamnese
 */
export const createAnamnesis = async (anamnesisData) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_records')
            .insert([{
                patient_id: anamnesisData.patientId,
                template_id: anamnesisData.templateId,
                nutritionist_id: anamnesisData.nutritionistId,
                date: anamnesisData.date || getTodayIsoDate(),
                content: anamnesisData.content,
                notes: anamnesisData.notes || null,
                status: anamnesisData.status || 'draft',
                version: 1
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao criar anamnese', error);
        return { data: null, error };
    }
};

/**
 * Atualizar anamnese existente
 * Incrementa versão automaticamente
 */
export const updateAnamnesis = async (anamnesisId, updatedData) => {
    try {
        // Primeiro busca a anamnese atual para pegar a versão
        const { data: current, error: fetchError } = await supabase
            .from('anamnesis_records')
            .select('version')
            .eq('id', anamnesisId)
            .single();

        if (fetchError) throw fetchError;

        // Atualiza com versão incrementada
        const { data, error } = await supabase
            .from('anamnesis_records')
            .update({
                content: updatedData.content,
                notes: updatedData.notes,
                status: updatedData.status,
                version: (current.version || 1) + 1,
                updated_at: new Date().toISOString()
            })
            .eq('id', anamnesisId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao atualizar anamnese', error);
        return { data: null, error };
    }
};

/**
 * Deletar anamnese
 */
export const deleteAnamnesis = async (anamnesisId) => {
    try {
        const { error } = await supabase
            .from('anamnesis_records')
            .delete()
            .eq('id', anamnesisId);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        logSupabaseError('Erro ao deletar anamnese', error);
        return { error };
    }
};

/**
 * Verificar se paciente tem anamnese
 * Útil para status no PatientHub
 */
export const checkPatientHasAnamnesis = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_records')
            .select('id', { count: 'exact', head: true })
            .eq('patient_id', patientId)
            .limit(1);

        if (error) throw error;
        return { hasAnamnesis: data && data.length > 0, error: null };
    } catch (error) {
        logSupabaseError('Erro ao verificar anamnese do paciente', error);
        return { hasAnamnesis: false, error };
    }
};

/**
 * Buscar última anamnese de um paciente
 * Útil para exibir no dashboard
 * @param {string} patientId - ID do paciente
 * @param {boolean} includeContent - Se true, inclui o campo 'content' completo (JSONB)
 * @returns {Promise<{data: object|null, error: object|null}>}
 */
export const getLatestAnamnesis = async (patientId, includeContent = false) => {
    try {
        let selectFields = `
            id,
            date,
            status,
            version,
            template:anamnesis_templates(title)
        `;
        
        // Incluir content se solicitado
        if (includeContent) {
            selectFields += ', content';
        }

        const { data, error } = await supabase
            .from('anamnesis_records')
            .select(selectFields)
            .eq('patient_id', patientId)
            .order('date', { ascending: false })
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            // Se não encontrar registros, não é erro
            if (error.code === 'PGRST116') {
                return { data: null, error: null };
            }
            throw error;
        }

        return { data, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar última anamnese', error);
        return { data: null, error };
    }
};


