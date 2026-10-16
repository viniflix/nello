import {readRequest} from './readRequest';
import {readPolicies} from '@/lib/utils/readPolicy';
import { collectBoundedPages, pageBounds } from './bounded-pages';
import { laboratoryNumber, laboratoryUnit, laboratoryReference, laboratoryPayload } from '@/lib/utils/laboratory';
import { clinicalRpc } from '@/lib/supabase/idempotent-mutations';
import { uploadVerifiedFile } from '@/lib/storage/verifiedUpload';
import { parsePrivateFile, signPrivateFile } from '@/lib/storage/privateFiles';
/**
 * SUPABASE QUERIES - LAB RESULTS (EXAMES LABORATORIAIS)
 * Funções para manipular exames laboratoriais de pacientes
 */

import { clinicalClient as supabase } from '@/infrastructure/supabase/domainClients';
import { formatDateToIsoDate } from '@/lib/utils/date';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

const riskOrder = { unknown: -1, none: 0, low: 1, medium: 2, high: 3 };
const defaultRiskMeta = { risk_level: 'unknown', risk_reason: 'Avaliação numérica indisponível.', marker_key: null };

/**
 * Busca todos os exames de um paciente
 * @param {string} patientId - ID do paciente
 * @param {number|null} limit - Recorte explícito; sem recorte lê páginas limitadas ou falha visivelmente.
 * @returns {Promise<{data: Array, error: Object}>}
 */
export async function getPatientLabResults(patientId, limit = null, readOptions = {}) {
    try {
        const build = () => supabase
            .from('lab_results')
            .select("id,patient_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,created_at,updated_at,pdf_url,pdf_filename,care_episode_id,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at,root_result_id,supersedes_result_id,revision_number,is_latest_revision,record_status,invalidated_at,invalidated_by,invalidation_reason")
            .eq('patient_id', patientId)
            .eq('is_latest_revision', true)
            .eq('record_status', 'active')
            .order('test_date', { ascending: false }).order('id', { ascending: false });
        if (limit != null) {
            return await readRequest(() => build().limit(pageBounds(limit).size), {signal:readOptions?.signal,policy:readPolicies.clinical});
        }
        const data = await collectBoundedPages((offset, size) => build().range(offset, offset + size - 1), { signal: readOptions.signal });
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_exames", error);
        return { data: null, error };
    }
}

/**
 * Busca exames recentes de um paciente (últimos 30 dias)
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: Array, error: Object}>}
 */
export async function getRecentLabResults(patientId, readOptions = {}) {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateString = formatDateToIsoDate(thirtyDaysAgo);

        const { data, error } = await readRequest(() => supabase
            .from('lab_results')
            .select("id,patient_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,created_at,updated_at,pdf_url,pdf_filename,care_episode_id,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at,root_result_id,supersedes_result_id,revision_number,is_latest_revision,record_status,invalidated_at,invalidated_by,invalidation_reason")
            .eq('patient_id', patientId)
            .eq('is_latest_revision', true)
            .eq('record_status', 'active')
            .gte('test_date', dateString)
            .order('test_date', { ascending: false }), {signal:readOptions?.signal,policy:readPolicies.clinical});

        return { data, error };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_exames_recentes", error);
        return { data: null, error };
    }
}

/**
 * Busca um exame específico por ID
 * @param {number} labResultId - ID do exame
 * @returns {Promise<{data: Object, error: Object}>}
 */
export async function getLabResultById(labResultId, readOptions = {}) {
    try {
        const { data, error } = await readRequest(() => supabase
            .from('lab_results')
            .select("id,patient_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,created_at,updated_at,pdf_url,pdf_filename,care_episode_id,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at,root_result_id,supersedes_result_id,revision_number,is_latest_revision,record_status,invalidated_at,invalidated_by,invalidation_reason")
            .eq('id', labResultId)
            .single(), {signal:readOptions?.signal,policy:readPolicies.clinical});

        return { data, error };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_exame", error);
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
        const { data, error } = await clinicalRpc('lab_result', {
            p_payload: laboratoryPayload(labResult)
        });

        return { data, error };
    } catch (error) {
        logSupabaseError("erro_ao_criar_exame", error);
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
        const { data: current, error: currentError } = await getLabResultById(labResultId);
        if (currentError) throw currentError;
        if (!current) throw new Error('Não foi possível carregar o exame para revisão.');

        const { data, error } = await supabase.rpc('revise_lab_result_record', {
            p_result_id: labResultId,
            p_payload: laboratoryPayload(updates, current),
            p_reason: 'Nova versão confirmada pelo nutricionista na interface'
        });

        return { data, error };
    } catch (error) {
        logSupabaseError("erro_ao_atualizar_exame", error);
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
        const { data, error } = await supabase.rpc('invalidate_lab_result_record', {
            p_result_id: labResultId,
            p_reason: 'Invalidado pelo nutricionista na interface de exames'
        });

        return { data, error };
    } catch (error) {
        logSupabaseError("erro_ao_deletar_exame", error);
        return { data: null, error };
    }
}

export async function confirmLabResultInterpretation(labResultId, reason) {
    try {
        const { data, error } = await supabase.rpc('confirm_lab_result_interpretation', {
            p_result_id: labResultId,
            p_reason: reason
        });
        return { data, error };
    } catch (error) {
        logSupabaseError("erro_ao_confirmar_interpretacao_laboratorial", error);
        return { data: null, error };
    }
}

/**
 * Busca exames por nome (útil para histórico de um exame específico)
 * @param {string} patientId - ID do paciente
 * @param {string} testName - Nome do exame
 * @returns {Promise<{data: Array, error: Object}>}
 */
export async function getLabResultsByTestName(patientId, testName, readOptions = {}) {
    try {
        const { data, error } = await readRequest(() => supabase
            .from('lab_results')
            .select("id,patient_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,created_at,updated_at,pdf_url,pdf_filename,care_episode_id,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at,root_result_id,supersedes_result_id,revision_number,is_latest_revision,record_status,invalidated_at,invalidated_by,invalidation_reason")
            .eq('patient_id', patientId)
            .eq('is_latest_revision', true)
            .eq('record_status', 'active')
            .ilike('test_name', `%${testName}%`)
            .order('test_date', { ascending: false }), {signal:readOptions?.signal,policy:readPolicies.clinical});

        return { data, error };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_exames_por_nome", error);
        return { data: null, error };
    }
}

/**
 * Busca exames com status anormal (low ou high)
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: Array, error: Object}>}
 */
export async function getAbnormalLabResults(patientId, readOptions = {}) {
    try {
        const { data, error } = await readRequest(() => supabase
            .from('lab_results')
            .select("id,patient_id,test_name,test_value,test_unit,reference_min,reference_max,status,test_date,notes,created_at,updated_at,pdf_url,pdf_filename,care_episode_id,reference_source,reference_snapshot,interpretation_status,confirmed_by,confirmed_at,root_result_id,supersedes_result_id,revision_number,is_latest_revision,record_status,invalidated_at,invalidated_by,invalidation_reason")
            .eq('patient_id', patientId)
            .eq('is_latest_revision', true)
            .eq('record_status', 'active')
            .in('status', ['low', 'high'])
            .order('test_date', { ascending: false }), {signal:readOptions?.signal,policy:readPolicies.clinical});

        return { data, error };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_exames_anormais", error);
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
    return laboratoryReference(testValue, refMin, refMax);
}

const normalizeMarkerKey = (value = '') => (
    String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
);

/**
 * Busca regras de risco laboratorial (globais + customizadas do nutricionista).
 */
export async function getLabRiskRules(nutritionistId = null) {
    try {
        let query = supabase
            .from('lab_risk_rules')
            .select("id,nutritionist_id,marker_key,marker_label,unit,low_threshold,high_threshold,risk_low,risk_high,is_active,config,created_at,updated_at")
            .eq('is_active', true);

        if (nutritionistId) {
            query = query.or(`nutritionist_id.is.null,nutritionist_id.eq.${nutritionistId}`);
        } else {
            // Sem escopo do nutricionista, retorna apenas regras globais
            query = query.is('nutritionist_id', null);
        }

        const { data, error } = await query;
        if (error) throw error;

        const sorted = (data || []).sort((a, b) => {
            // Regra customizada sobrescreve global quando marker_key coincide
            const aScoped = a?.nutritionist_id ? 1 : 0;
            const bScoped = b?.nutritionist_id ? 1 : 0;
            return bScoped - aScoped;
        });

        return { data: sorted, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_regras_de_risco_laboratorial", error);
        return { data: [], error };
    }
}

/**
 * Classifica risco de um exame com base em regras + referência manual.
 */
export function classifyLabResultRisk(labResult, rules = []) {
    if (!labResult) return { ...defaultRiskMeta };

    const markerKey = normalizeMarkerKey(labResult.marker_key || labResult.test_name);
    const scopedRule = (rules || []).find((rule) => normalizeMarkerKey(rule.marker_key) === markerKey);
    const result = laboratoryNumber(labResult.test_value);
    const unavailable = reason => ({ ...defaultRiskMeta, marker_key: markerKey, risk_reason: reason });
    if (result.kind !== 'number') return unavailable(result.kind === 'missing' ? 'Resultado numérico não informado.' : 'Resultado não numérico; confira o laudo.');
    const testValue = result.value;
    const unit = laboratoryUnit(labResult.test_unit);
    if (!unit) return unavailable('Unidade do resultado não informada.');

    if (scopedRule) {
        if (!laboratoryUnit(scopedRule.unit) || unit !== laboratoryUnit(scopedRule.unit)) return unavailable('Unidade incompatível com a regra; confira o laudo e a referência.');
        const low = laboratoryNumber(scopedRule.low_threshold), high = laboratoryNumber(scopedRule.high_threshold);
        const hasLow = low.kind === 'number', hasHigh = high.kind === 'number';
        if (low.kind === 'invalid' || high.kind === 'invalid' || (!hasLow && !hasHigh) || (hasLow && hasHigh && low.value > high.value)) return unavailable('Limites da regra indisponíveis ou inválidos.');
        const lowThreshold = low.value, highThreshold = high.value;

        if (hasLow && testValue < lowThreshold) {
            return {
                marker_key: markerKey,
                risk_level: scopedRule.risk_low || 'medium',
                risk_reason: `Abaixo do limiar (${lowThreshold}${scopedRule.unit ? ` ${scopedRule.unit}` : ''})`
            };
        }
        if (hasHigh && testValue > highThreshold) {
            return {
                marker_key: markerKey,
                risk_level: scopedRule.risk_high || 'high',
                risk_reason: `Acima do limiar (${highThreshold}${scopedRule.unit ? ` ${scopedRule.unit}` : ''})`
            };
        }
        return { marker_key: markerKey, risk_level: 'none', risk_reason: 'Dentro da faixa esperada' };
    }

    const min = laboratoryNumber(labResult.reference_min), max = laboratoryNumber(labResult.reference_max);
    if (min.kind === 'invalid' || max.kind === 'invalid' || (min.kind === 'number' && max.kind === 'number' && min.value > max.value)) return unavailable('Referência numérica inválida.');
    if (min.kind === 'number' && testValue < min.value) {
        return { marker_key: markerKey, risk_level: 'medium', risk_reason: 'Abaixo da referência' };
    }
    if (max.kind === 'number' && testValue > max.value) {
        return { marker_key: markerKey, risk_level: 'high', risk_reason: 'Acima da referência' };
    }

    if (min.kind !== 'number' || max.kind !== 'number') return unavailable('Referência numérica incompleta ou não informada.');
    return { marker_key: markerKey, risk_level: 'none', risk_reason: 'Dentro da referência informada.' };
}

/**
 * Classifica uma lista de exames e retorna resumo de risco.
 */
export function classifyLabResultsRiskBatch(labResults = [], rules = []) {
    const enriched = (labResults || []).map((item) => {
        const risk = classifyLabResultRisk(item, rules);
        return {
            ...item,
            risk_level: risk.risk_level,
            risk_reason: risk.risk_reason,
            marker_key: risk.marker_key || normalizeMarkerKey(item?.test_name)
        };
    });

    const highestRisk = enriched.reduce((acc, current) => {
        const accLevel = riskOrder[acc] ?? 0;
        const currentLevel = riskOrder[current.risk_level] ?? 0;
        return currentLevel > accLevel ? current.risk_level : acc;
    }, 'unknown');

    return {
        data: enriched,
        summary: {
            total: enriched.length,
            high: enriched.filter((item) => item.risk_level === 'high').length,
            medium: enriched.filter((item) => item.risk_level === 'medium').length,
            low: enriched.filter((item) => item.risk_level === 'low').length,
            unknown: enriched.filter((item) => item.risk_level === 'unknown').length,
            highest_risk: highestRisk
        }
    };
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
        logSupabaseError("erro_ao_agrupar_exames", error);
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
        const fileName = `${patientId}/${crypto.randomUUID()}.pdf`;

        // Upload para o storage
        await uploadVerifiedFile('lab-results-pdfs', fileName, file);

        return {
            url: fileName,
            filename: file.name,
            path: fileName,
            error: null
        };
    } catch (error) {
        logSupabaseError("erro_ao_fazer_upload_do_pdf", error);
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

        const parsed = parsePrivateFile(pdfUrl, 'lab-results-pdfs');
        if (!parsed) throw new Error('invalid_private_file_reference');
        const filePath = parsed.path;

        // Only an unbound upload can be abandoned. Clinical history is retained.
        const { error } = await supabase.rpc('abandon_storage_upload', {
            p_bucket: 'lab-results-pdfs', p_path: filePath,
        });

        if (error) throw error;

        return { success: true, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_deletar_pdf", error);
        return { success: false, error };
    }
}

/**
 * Obtém URL assinada (signed URL) para visualizar PDF
 * @param {string} filePath - Caminho do arquivo no storage
 * @param {number} expiresIn - Tempo de expiração em segundos (padrão: 1 hora)
 * @returns {Promise<{url: string, error: Object}>}
 */
export async function getLabResultPDFUrl(filePath, expiresIn = 300) {
    try {
        const url = await signPrivateFile(filePath, 'lab-results-pdfs', expiresIn);
        return { url, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_obter_url_do_pdf", error);
        return { url: null, error };
    }
}
