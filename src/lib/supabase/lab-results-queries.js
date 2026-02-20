/**
 * SUPABASE QUERIES - LAB RESULTS (EXAMES LABORATORIAIS)
 * Funções para manipular exames laboratoriais de pacientes
 */

import { supabase } from '@/lib/customSupabaseClient';
import { formatDateToIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * Busca todos os exames de um paciente
 * @param {string} patientId - ID do paciente
 * @param {number} limit - Número máximo de resultados (padrão: 50)
 * @returns {Promise<{data: Array, error: Object}>}
 */
export async function getPatientLabResults(patientId, limit = 50) {
    try {
        const { data, error } = await supabase
            .from('lab_results')
            .select('*')
            .eq('patient_id', patientId)
            .order('test_date', { ascending: false })
            .limit(limit);

        return { data, error };
    } catch (error) {
        logSupabaseError('Erro ao buscar exames', error);
        return { data: null, error };
    }
}

/**
 * Busca exames recentes de um paciente (últimos 30 dias)
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: Array, error: Object}>}
 */
export async function getRecentLabResults(patientId) {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateString = formatDateToIsoDate(thirtyDaysAgo);

        const { data, error } = await supabase
            .from('lab_results')
            .select('*')
            .eq('patient_id', patientId)
            .gte('test_date', dateString)
            .order('test_date', { ascending: false });

        return { data, error };
    } catch (error) {
        logSupabaseError('Erro ao buscar exames recentes', error);
        return { data: null, error };
    }
}

/**
 * Busca um exame específico por ID
 * @param {number} labResultId - ID do exame
 * @returns {Promise<{data: Object, error: Object}>}
 */
export async function getLabResultById(labResultId) {
    try {
        const { data, error } = await supabase
            .from('lab_results')
            .select('*')
            .eq('id', labResultId)
            .single();

        return { data, error };
    } catch (error) {
        logSupabaseError('Erro ao buscar exame', error);
        return { data: null, error };
    }
}

/**
 * Cria um novo exame laboratorial
 * @param {Object} labResult - Dados do exame
 * @param {string} labResult.patient_id - ID do paciente
 * @param {string} labResult.test_name - Nome do exame
 * @param {string} labResult.test_value - Valor do resultado
 * @param {string} labResult.test_unit - Unidade de medida
 * @param {number} labResult.reference_min - Valor mínimo de referência
 * @param {number} labResult.reference_max - Valor máximo de referência
 * @param {string} labResult.test_date - Data do exame (YYYY-MM-DD)
 * @param {string} labResult.notes - Observações
 * @returns {Promise<{data: Object, error: Object}>}
 */
export async function createLabResult(labResult) {
    try {
        // Calcular status apenas se houver valores manuais
        let status = 'pending';
        if (labResult.test_value !== null && labResult.test_value !== undefined && labResult.test_value !== '') {
            status = calculateStatus(
                labResult.test_value,
                labResult.reference_min,
                labResult.reference_max
            );
        }

        const { data, error } = await supabase
            .from('lab_results')
            .insert([{
                ...labResult,
                status
            }])
            .select()
            .single();

        return { data, error };
    } catch (error) {
        logSupabaseError('Erro ao criar exame', error);
        return { data: null, error };
    }
}

/**
 * Atualiza um exame existente
 * @param {number} labResultId - ID do exame
 * @param {Object} updates - Campos a atualizar
 * @returns {Promise<{data: Object, error: Object}>}
 */
export async function updateLabResult(labResultId, updates) {
    try {
        // Buscar dados atuais
        const { data: current } = await getLabResultById(labResultId);

        // Recalcular status apenas se houver valores manuais e mudaram
        const finalTestValue = updates.test_value !== undefined ? updates.test_value : current?.test_value;
        const hasManualValue = finalTestValue !== null && finalTestValue !== undefined && finalTestValue !== '';
        const shouldRecalculateStatus =
            hasManualValue &&
            (updates.test_value !== undefined || updates.reference_min !== undefined || updates.reference_max !== undefined);

        if (shouldRecalculateStatus && current) {
            updates.status = calculateStatus(
                finalTestValue,
                updates.reference_min !== undefined ? updates.reference_min : current.reference_min,
                updates.reference_max !== undefined ? updates.reference_max : current.reference_max
            );
        } else if (!hasManualValue && updates.test_value === null) {
            // Se removeu o test_value, setar status como pending
            updates.status = 'pending';
        }

        const { data, error } = await supabase
            .from('lab_results')
            .update(updates)
            .eq('id', labResultId)
            .select()
            .single();

        return { data, error };
    } catch (error) {
        logSupabaseError('Erro ao atualizar exame', error);
        return { data: null, error };
    }
}

/**
 * Deleta um exame
 * @param {number} labResultId - ID do exame
 * @returns {Promise<{data: Object, error: Object}>}
 */
export async function deleteLabResult(labResultId) {
    try {
        // Primeiro, buscar o exame para ver se tem PDF
        const { data: labResult } = await getLabResultById(labResultId);

        // Se tem PDF, deletar do storage antes
        if (labResult?.pdf_url) {
            await deleteLabResultPDF(labResult.pdf_url);
        }

        // Deletar o registro
        const { data, error } = await supabase
            .from('lab_results')
            .delete()
            .eq('id', labResultId)
            .select()
            .single();

        return { data, error };
    } catch (error) {
        logSupabaseError('Erro ao deletar exame', error);
        return { data: null, error };
    }
}

/**
 * Busca exames por nome (útil para histórico de um exame específico)
 * @param {string} patientId - ID do paciente
 * @param {string} testName - Nome do exame
 * @returns {Promise<{data: Array, error: Object}>}
 */
export async function getLabResultsByTestName(patientId, testName) {
    try {
        const { data, error } = await supabase
            .from('lab_results')
            .select('*')
            .eq('patient_id', patientId)
            .ilike('test_name', `%${testName}%`)
            .order('test_date', { ascending: false });

        return { data, error };
    } catch (error) {
        logSupabaseError('Erro ao buscar exames por nome', error);
        return { data: null, error };
    }
}

/**
 * Busca exames com status anormal (low ou high)
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: Array, error: Object}>}
 */
export async function getAbnormalLabResults(patientId) {
    try {
        const { data, error } = await supabase
            .from('lab_results')
            .select('*')
            .eq('patient_id', patientId)
            .in('status', ['low', 'high'])
            .order('test_date', { ascending: false });

        return { data, error };
    } catch (error) {
        logSupabaseError('Erro ao buscar exames anormais', error);
        return { data: null, error };
    }
}

/**
 * Calcula o status de um exame baseado no valor e referências
 * @param {string|number} testValue - Valor do exame
 * @param {number} refMin - Valor mínimo de referência
 * @param {number} refMax - Valor máximo de referência
 * @returns {string} Status: 'normal', 'low', 'high', ou 'pending'
 */
export function calculateStatus(testValue, refMin, refMax) {
    // Se não há valores de referência ou valor é inválido, retornar pending
    if (refMin == null || refMax == null || testValue == null || testValue === '') {
        return 'pending';
    }

    // Tentar converter para número
    const numericValue = parseFloat(testValue);

    // Se não for um número válido, retornar pending
    if (isNaN(numericValue)) {
        return 'pending';
    }

    // Calcular status
    if (numericValue < refMin) {
        return 'low';
    } else if (numericValue > refMax) {
        return 'high';
    } else {
        return 'normal';
    }
}

/**
 * Agrupa exames por nome e retorna histórico organizado
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: Object, error: Object}>}
 */
export async function getLabResultsGroupedByName(patientId) {
    try {
        const { data, error } = await getPatientLabResults(patientId);

        if (error) return { data: null, error };

        // Agrupar por nome do exame
        const grouped = data.reduce((acc, lab) => {
            if (!acc[lab.test_name]) {
                acc[lab.test_name] = [];
            }
            acc[lab.test_name].push(lab);
            return acc;
        }, {});

        return { data: grouped, error: null };
    } catch (error) {
        logSupabaseError('Erro ao agrupar exames', error);
        return { data: null, error };
    }
}

// =====================================================
// PDF UPLOAD & MANAGEMENT
// =====================================================

/**
 * Faz upload de um PDF de exame para o Supabase Storage
 * @param {string} patientId - ID do paciente
 * @param {File} file - Arquivo PDF
 * @returns {Promise<{url: string, filename: string, error: Object}>}
 */
export async function uploadLabResultPDF(patientId, file) {
    try {
        // Validar tipo de arquivo
        if (file.type !== 'application/pdf') {
            return {
                url: null,
                filename: null,
                error: { message: 'Apenas arquivos PDF são permitidos' }
            };
        }

        // Validar tamanho (max 10MB)
        const maxSize = 10 * 1024 * 1024; // 10MB
        if (file.size > maxSize) {
            return {
                url: null,
                filename: null,
                error: { message: 'O arquivo deve ter no máximo 10MB' }
            };
        }

        // Gerar nome único para o arquivo
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const fileExtension = 'pdf';
        const fileName = `${patientId}/${timestamp}_${randomString}.${fileExtension}`;

        // Upload para o storage
        const { data, error } = await supabase.storage
            .from('lab-results-pdfs')
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) throw error;

        // Obter URL pública (signed URL para acesso privado)
        const { data: urlData } = await supabase.storage
            .from('lab-results-pdfs')
            .createSignedUrl(fileName, 31536000); // 1 ano

        return {
            url: urlData.signedUrl,
            filename: file.name,
            path: fileName,
            error: null
        };
    } catch (error) {
        logSupabaseError('Erro ao fazer upload do PDF', error);
        return { url: null, filename: null, error };
    }
}

/**
 * Deleta um PDF do Supabase Storage
 * @param {string} pdfUrl - URL completa do PDF
 * @returns {Promise<{success: boolean, error: Object}>}
 */
export async function deleteLabResultPDF(pdfUrl) {
    try {
        if (!pdfUrl) {
            return { success: false, error: { message: 'URL do PDF não fornecida' } };
        }

        // Extrair o path do arquivo da URL
        // Formato esperado: https://...storage/v1/object/sign/lab-results-pdfs/patientId/file.pdf?token=...
        const urlParts = pdfUrl.split('/lab-results-pdfs/');
        if (urlParts.length < 2) {
            return { success: false, error: { message: 'URL inválida' } };
        }

        const pathWithToken = urlParts[1];
        const filePath = pathWithToken.split('?')[0]; // Remove query params

        // Deletar do storage
        const { error } = await supabase.storage
            .from('lab-results-pdfs')
            .remove([filePath]);

        if (error) throw error;

        return { success: true, error: null };
    } catch (error) {
        logSupabaseError('Erro ao deletar PDF', error);
        return { success: false, error };
    }
}

/**
 * Obtém URL assinada (signed URL) para visualizar PDF
 * @param {string} filePath - Caminho do arquivo no storage
 * @param {number} expiresIn - Tempo de expiração em segundos (padrão: 1 hora)
 * @returns {Promise<{url: string, error: Object}>}
 */
export async function getLabResultPDFUrl(filePath, expiresIn = 3600) {
    try {
        const { data, error } = await supabase.storage
            .from('lab-results-pdfs')
            .createSignedUrl(filePath, expiresIn);

        if (error) throw error;

        return { url: data.signedUrl, error: null };
    } catch (error) {
        logSupabaseError('Erro ao obter URL do PDF', error);
        return { url: null, error };
    }
}
