import { supabase } from '@/lib/customSupabaseClient';

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
        console.error('Erro ao buscar templates de anamnese:', error);
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
        console.error('Erro ao buscar template:', error);
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
        console.error('Erro ao criar template:', error);
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
        console.error('Erro ao buscar anamneses do paciente:', error);
        return { data: null, error };
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
            console.error('Erro ao buscar anamnesis_records:', anamnesisError);
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
                .select('id, full_name, name')
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
        console.error('Erro ao buscar anamnese:', error);
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
                date: anamnesisData.date || new Date().toISOString().split('T')[0],
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
        console.error('Erro ao criar anamnese:', error);
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
        console.error('Erro ao atualizar anamnese:', error);
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
        console.error('Erro ao deletar anamnese:', error);
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
        console.error('Erro ao verificar anamnese do paciente:', error);
        return { hasAnamnesis: false, error };
    }
};

/**
 * Buscar última anamnese de um paciente
 * Útil para exibir no dashboard
 */
export const getLatestAnamnesis = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_records')
            .select(`
                id,
                date,
                status,
                version,
                template:anamnesis_templates(title)
            `)
            .eq('patient_id', patientId)
            .order('date', { ascending: false })
            .order('version', { ascending: false })
            .limit(1)
            .single();

        if (error) {
            // Se não encontrar registros, não é erro
            if (error.code === 'PGRST116') {
                return { data: null, error: null };
            }
            throw error;
        }

        return { data, error: null };
    } catch (error) {
        console.error('Erro ao buscar última anamnese:', error);
        return { data: null, error };
    }
};

// ============================================================
// ANAMNESE FIELDS (Sistema Modular)
// ============================================================

/**
 * Buscar todos os campos de anamnese de um nutricionista
 * Se customTemplateId fornecido, busca apenas campos associados ao template
 */
export const getAnamneseFields = async (nutritionistId, customTemplateId = null) => {
    try {
        if (customTemplateId) {
            // Buscar campos associados ao template específico
            const { data, error } = await supabase
                .from('anamnesis_template_fields')
                .select(`
                    field_id,
                    field_order,
                    anamnese_fields (*)
                `)
                .eq('template_id', customTemplateId)
                .order('field_order', { ascending: true });

            if (error) throw error;

            // Extrair os campos da relação
            const fields = (data || []).map(item => item.anamnese_fields).filter(Boolean);
            return { data: fields, error: null };
        } else {
            // Buscar todos os campos do nutricionista (sem filtro de template)
            const { data, error } = await supabase
                .from('anamnese_fields')
                .select('*')
                .eq('nutritionist_id', nutritionistId)
                .order('id', { ascending: true });

            if (error) throw error;
            return { data: data || [], error: null };
        }
    } catch (error) {
        console.error('Erro ao buscar campos de anamnese:', error);
        return { data: null, error };
    }
};

/**
 * Criar novo campo de anamnese
 */
export const createAnamneseField = async (fieldData) => {
    try {
        const { data, error } = await supabase
            .from('anamnese_fields')
            .insert([{
                nutritionist_id: fieldData.nutritionistId,
                field_label: fieldData.fieldLabel,
                field_type: fieldData.fieldType,
                category: fieldData.category || 'geral',
                is_required: fieldData.isRequired || false
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao criar campo de anamnese:', error);
        return { data: null, error };
    }
};

/**
 * Atualizar campo de anamnese
 */
export const updateAnamneseField = async (fieldId, fieldData) => {
    try {
        const updateData = {
            field_label: fieldData.fieldLabel,
            field_type: fieldData.fieldType
        };

        // Adicionar category e is_required se fornecidos
        if (fieldData.category !== undefined) {
            updateData.category = fieldData.category;
        }
        if (fieldData.isRequired !== undefined) {
            updateData.is_required = fieldData.isRequired;
        }

        const { data, error } = await supabase
            .from('anamnese_fields')
            .update(updateData)
            .eq('id', fieldId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao atualizar campo de anamnese:', error);
        return { data: null, error };
    }
};

/**
 * Deletar campo de anamnese
 */
export const deleteAnamneseField = async (fieldId) => {
    try {
        const { error } = await supabase
            .from('anamnese_fields')
            .delete()
            .eq('id', fieldId);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error('Erro ao deletar campo de anamnese:', error);
        return { error };
    }
};

/**
 * Associar campo a um template personalizado
 */
export const addFieldToTemplate = async (templateId, fieldId, fieldOrder = 0) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_template_fields')
            .insert([{
                template_id: templateId,
                field_id: fieldId,
                field_order: fieldOrder
            }])
            .select();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao associar campo ao template:', error);
        return { data: null, error };
    }
};

/**
 * Remover campo de um template personalizado
 */
export const removeFieldFromTemplate = async (templateId, fieldId) => {
    try {
        const { error } = await supabase
            .from('anamnesis_template_fields')
            .delete()
            .eq('template_id', templateId)
            .eq('field_id', fieldId);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error('Erro ao remover campo do template:', error);
        return { error };
    }
};

// ============================================================
// FIELD OPTIONS (Opções para campos de seleção)
// ============================================================

/**
 * Buscar opções de um campo específico
 */
export const getFieldOptions = async (fieldId) => {
    try {
        const { data, error } = await supabase
            .from('anamnese_field_options')
            .select('*')
            .eq('field_id', fieldId)
            .order('option_order', { ascending: true });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao buscar opções do campo:', error);
        return { data: null, error };
    }
};

/**
 * Criar opções para um campo (usado após criar campo de seleção)
 */
export const createFieldOptions = async (fieldId, options) => {
    try {
        // options é um array de strings: ['Opção 1', 'Opção 2', ...]
        const optionsData = options.map((optionText, index) => ({
            field_id: fieldId,
            option_text: optionText,
            option_order: index
        }));

        const { data, error } = await supabase
            .from('anamnese_field_options')
            .insert(optionsData)
            .select();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao criar opções do campo:', error);
        return { data: null, error };
    }
};

/**
 * Atualizar opções de um campo (deleta antigas e cria novas)
 */
export const updateFieldOptions = async (fieldId, options) => {
    try {
        // Deletar opções antigas
        const { error: deleteError } = await supabase
            .from('anamnese_field_options')
            .delete()
            .eq('field_id', fieldId);

        if (deleteError) throw deleteError;

        // Criar novas opções
        if (options && options.length > 0) {
            const { data, error: createError } = await createFieldOptions(fieldId, options);
            if (createError) throw createError;
            return { data, error: null };
        }

        return { data: [], error: null };
    } catch (error) {
        console.error('Erro ao atualizar opções do campo:', error);
        return { data: null, error };
    }
};

/**
 * Copiar campos de um nutricionista para outro (importação)
 */
export const copyFieldsBetweenForms = async (sourceNutritionistId, targetNutritionistId) => {
    try {
        // Buscar campos do formulário fonte
        const { data: sourceFields, error: fetchError } = await supabase
            .from('anamnese_fields')
            .select('*')
            .eq('nutritionist_id', sourceNutritionistId);

        if (fetchError) throw fetchError;

        // Copiar para o formulário destino
        const fieldsToInsert = sourceFields.map(field => ({
            nutritionist_id: targetNutritionistId,
            field_label: field.field_label,
            field_type: field.field_type,
            category: field.category,
            is_required: field.is_required
        }));

        const { data, error } = await supabase
            .from('anamnese_fields')
            .insert(fieldsToInsert)
            .select();

        if (error) throw error;

        // Copiar opções se existirem
        for (let i = 0; i < sourceFields.length; i++) {
            const sourceField = sourceFields[i];
            const newField = data[i];

            if (sourceField.field_type === 'selecao_unica' || sourceField.field_type === 'selecao_multipla') {
                const { data: options } = await getFieldOptions(sourceField.id);
                if (options && options.length > 0) {
                    await createFieldOptions(newField.id, options.map(opt => opt.option_text));
                }
            }
        }

        return { data, error: null };
    } catch (error) {
        console.error('Erro ao copiar campos:', error);
        return { data: null, error };
    }
};

// ============================================================
// ANAMNESE ANSWERS (Sistema Modular)
// ============================================================

/**
 * Buscar respostas de anamnese para um paciente específico
 */
export const getAnamneseAnswers = async (patientId) => {
    try {
        const { data, error } = await supabase
            .from('anamnese_answers')
            .select('*')
            .eq('patient_id', patientId);

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao buscar respostas de anamnese:', error);
        return { data: null, error };
    }
};

/**
 * Salvar/atualizar respostas de anamnese (upsert)
 * Usa (patient_id, field_id) como constraint para evitar duplicatas
 */
export const upsertAnamneseAnswers = async (answersData) => {
    try {
        const { data, error } = await supabase
            .from('anamnese_answers')
            .upsert(answersData, {
                onConflict: 'patient_id,field_id'
            })
            .select();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao salvar respostas de anamnese:', error);
        return { data: null, error };
    }
};

// ============================================================
// CUSTOM TEMPLATES (Formulários Personalizados)
// ============================================================

/**
 * Buscar formulários personalizados de um nutricionista
 * Retorna templates customizados criados pelo nutricionista (não do sistema)
 */
export const getCustomTemplates = async (nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_templates')
            .select('*')
            .eq('nutritionist_id', nutritionistId)
            .eq('is_system_default', false)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao buscar formulários personalizados:', error);
        return { data: null, error };
    }
};

/**
 * Criar novo formulário personalizado
 */
export const createCustomFormTemplate = async (templateData) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_templates')
            .insert([{
                nutritionist_id: templateData.nutritionistId,
                title: templateData.title,
                description: templateData.description || null,
                is_system_default: false,
                is_active: true,
                sections: [] // Vazio pois usa anamnese_fields
            }])
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao criar formulário personalizado:', error);
        return { data: null, error };
    }
};

/**
 * Atualizar formulário personalizado
 */
export const updateCustomFormTemplate = async (templateId, templateData) => {
    try {
        const { data, error } = await supabase
            .from('anamnesis_templates')
            .update({
                title: templateData.title,
                description: templateData.description || null
            })
            .eq('id', templateId)
            .select()
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao atualizar formulário personalizado:', error);
        return { data: null, error };
    }
};

/**
 * Deletar formulário personalizado
 * Por enquanto apenas deleta o template (campos ficam órfãos até implementarmos a relação)
 */
export const deleteCustomFormTemplate = async (templateId) => {
    try {
        // Deletar o template
        const { error } = await supabase
            .from('anamnesis_templates')
            .delete()
            .eq('id', templateId);

        if (error) throw error;
        return { error: null };
    } catch (error) {
        console.error('Erro ao deletar formulário personalizado:', error);
        return { error };
    }
};
