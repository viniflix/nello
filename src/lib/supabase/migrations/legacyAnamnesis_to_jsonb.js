/**
 * SPRINT 1 - Graceful Migration Script
 * Este script visa migrar o legado EAV (anamnese_answers, anamnese_fields)
 * para a nova coluna JSONB (content) da tabela anamnesis_records.
 * 
 * Uso: Este script pode ser rodado via Edge Function disparado manualmente
 * ou num cronjob, dependendo do volume. Por ser um processo crítico,
 * desenhamos a query com idempotencia.
 */

import { supabase } from '@/lib/customSupabaseClient';

export const migrateLegacyAnamnesisToJsonb = async (limit = 100) => {
    console.log(`[Migration] Iniciando lote de ${limit} registros...`);

    // 1. Pegar registros antigos que ainda não possuem JSONB alimentado
    const { data: records, error: fetchError } = await supabase
        .from('anamnesis_records')
        .select('*')
        // Usa null-check para garantir idempotência, só converte os não-convertidos
        .filter('content', 'is', 'null')
        .limit(limit);

    if (fetchError) {
        console.error('[Migration] Falha ao ler records', fetchError);
        return { success: false, error: fetchError };
    }

    if (!records || records.length === 0) {
        console.log('[Migration] Nenhum registro legado pendente. Migration Completa!');
        return { success: true, count: 0 };
    }

    let processedCount = 0;

    // 2. Loop sobre os records velhos (EAV extraction)
    for (const record of records) {
        console.log(`Migrando PatientID ${record.patient_id} (Record ${record.id})`);

        // Extrai todas as repostas antigas do paciente para este form (EAV Model)
        const { data: answers, error: answersError } = await supabase
            .from('anamnese_answers')
            .select(`
                id, answer_value,
                anamnese_fields ( id, question_text, field_type, category )
            `)
            .eq('patient_id', record.patient_id) // Assumindo relação
            // Nota: Se houver link direto por record_id na tabela antiga, ajustar a chave
            
        if (answersError) {
            console.error(`[Migration] Erro ao puxar respostas pro PID ${record.patient_id}`);
            continue;
        }

        // Se não tem respostas, podemos inicializar como payload vazio
        if (!answers || answers.length === 0) {
            await supabase
                .from('anamnesis_records')
                .update({ content: {} })
                .eq('id', record.id);
            continue;
        }

        // 3. Montagem do Dict/Hash map aglutinando tudo pro JSONB
        const jsonbPayload = {};

        answers.forEach((ans) => {
            if (ans.anamnese_fields) {
                const questionKey = ans.anamnese_fields.id; // Ou slug se tivesse
                jsonbPayload[questionKey] = {
                    question: ans.anamnese_fields.question_text,
                    category: ans.anamnese_fields.category,
                    value: ans.answer_value,
                    _legacy_migrated: true
                };
            }
        });

        // 4. Update Atomic Update no banco novo
        const { error: updateError } = await supabase
            .from('anamnesis_records')
            .update({ content: jsonbPayload })
            .eq('id', record.id);

        if (!updateError) {
            processedCount++;
        }
    }

    console.log(`[Migration] Lote finalizado com ${processedCount} JSONBs injetados.`);
    return { success: true, count: processedCount };
};
