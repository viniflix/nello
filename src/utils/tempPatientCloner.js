import { supabase } from '@/lib/customSupabaseClient';
import { getPatientProfile, removeEmptyPatient } from '@/lib/supabase/patient-queries';
import { getMealPlans, copyMealPlanToPatient } from '@/lib/supabase/meal-plan-queries';

export const duplicatePatientTemporarily = async (originalPatientId, nutritionistId, options = {}, onProgress = () => {}) => {
    const reportProgress = (text, status = 'loading') => {
        console.log(`[tempPatientCloner] ${text} (${status})`);
        onProgress({ text, status });
    };

    try {
        reportProgress('Buscando dados do paciente original...', 'loading');
        const { data: originalProfile, error: profileError } = await getPatientProfile(originalPatientId, nutritionistId);
        if (profileError || !originalProfile) throw new Error('Não foi possível carregar o perfil original.');

        const cloneName = options.customName?.trim() || `(Cópia) ${originalProfile.name || 'Paciente'}`;
        
        reportProgress('Criando novo perfil de paciente...', 'loading');
        const body = {
            email: null, 
            metadata: {
                name: cloneName,
                nutritionist_id: nutritionistId,
                birth_date: originalProfile.birth_date,
                phone: originalProfile.phone,
                cpf: originalProfile.cpf,
                gender: originalProfile.gender,
                occupation: originalProfile.occupation,
                civil_status: originalProfile.civil_status,
                observations: 'DUPLICATA DE TESTE',
                address: originalProfile.address
            },
            redirectTo: `${window.location.origin}/update-password?mode=invite`,
            defaultPassword: '',
            isOffline: true,
            sendInvite: false
        };

        const { data: cloneData, error: createError } = await supabase.functions.invoke('create-patient', {
            body: JSON.stringify(body)
        });

        if (createError) throw createError;

        const newPatientId = cloneData?.userId;
        if (!newPatientId) throw new Error('Falha ao obter o ID do novo paciente criado.');
        reportProgress('Perfil criado com sucesso!', 'success');

        // Buscar o care_episode ativo do novo clone para vincular aos registros corretamente
        const { data: activeEpisode } = await supabase
            .from('care_episodes')
            .select('id')
            .eq('patient_id', newPatientId)
            .eq('status', 'active')
            .single();
        const newCareEpisodeId = activeEpisode?.id;

        const tableMap = {
            anthropometry: { table: 'growth_records', name: 'Antropometria' },
            energy_expenditures: { table: 'energy_expenditure_calculations', name: 'Gasto Energético' },
            goals: { table: 'patient_goals', name: 'Metas' },
            lab_results: { table: 'lab_results', name: 'Exames Laboratoriais' },
            anamnesis_records: { table: 'anamnesis_records', name: 'Anamneses' },
        };

        const tasks = [];

        for (const [optionKey, config] of Object.entries(tableMap)) {
            if (options[optionKey]) {
                tasks.push((async () => {
                    reportProgress(`Copiando ${config.name}...`, 'loading');
                    const { data: records } = await supabase
                        .from(config.table)
                        .select('*')
                        .eq('patient_id', originalPatientId);

                    if (records && records.length > 0) {
                        const clones = records.map(record => {
                            const clone = { ...record };
                            delete clone.id;
                            clone.patient_id = newPatientId;
                            
                            // Corrigir o vínculo do episódio de cuidado
                            if (clone.care_episode_id && newCareEpisodeId) {
                                clone.care_episode_id = newCareEpisodeId;
                            }
                            
                            // Corrigir o nutricionista responsável
                            if (clone.nutritionist_id) {
                                clone.nutritionist_id = nutritionistId;
                            }

                            if (clone.created_at) delete clone.created_at;
                            if (clone.updated_at) delete clone.updated_at;

                            // Prevenir conflitos de índice único gerando novos IDs de revisão
                            if (clone.revision_group_id) {
                                clone.revision_group_id = crypto.randomUUID();
                            }

                            if (config.table === 'patient_goals') {
                                clone.energy_expenditure_id = null;
                                clone.meal_plan_id = null;
                            }
                            if (config.table === 'lab_results') {
                                clone.root_result_id = null;
                                clone.supersedes_result_id = null;
                            }
                            if (config.table === 'anamnesis_records') {
                                clone.appointment_id = null;
                            }
                            return clone;
                        });

                        const { error: insertError } = await supabase.from(config.table).insert(clones);
                        if (insertError) {
                            reportProgress(`Erro ao copiar ${config.name}`, 'error');
                            console.error(`[tempPatientCloner] Erro ao clonar a tabela ${config.table}:`, insertError);
                        } else {
                            reportProgress(`${config.name} copiada(s).`, 'success');
                        }
                    } else {
                        reportProgress(`Sem dados em ${config.name}.`, 'success');
                    }
                })());
            }
        }

        if (options.mealPlans) {
            tasks.push((async () => {
                reportProgress('Copiando Planos Alimentares...', 'loading');
                const { data: mealPlans } = await getMealPlans(originalPatientId);
                if (mealPlans && mealPlans.length > 0) {
                    let successCount = 0;
                    // Os planos alimentares podem ser copiados em paralelo também
                    await Promise.all(mealPlans.map(async (plan) => {
                        try {
                            await copyMealPlanToPatient(plan.id, newPatientId);
                            successCount++;
                        } catch (e) {
                            console.error('Falha ao copiar plano', e);
                        }
                    }));
                    reportProgress(`${successCount}/${mealPlans.length} planos copiados.`, 'success');
                } else {
                    reportProgress(`Sem planos alimentares.`, 'success');
                }
            })());
        }

        await Promise.all(tasks);

        reportProgress('Duplicação concluída!', 'success');
        return { success: true, newPatientId };

    } catch (error) {
        reportProgress('Falha ao duplicar: ' + error.message, 'error');
        console.error('[tempPatientCloner] Falha geral ao duplicar:', error);
        return { success: false, error };
    }
};

export const forceDeleteClone = async (patientId) => {
    try {
        console.log(`[tempPatientCloner] Iniciando deleção forçada via RPC especial para o clone ${patientId}...`);
        
        // Chama a RPC criada no Supabase SQL Editor para bypassar os triggers de segurança médica
        const { error: rpcError } = await supabase.rpc('force_delete_test_clone', {
            p_patient_id: patientId
        });

        if (rpcError) {
            console.error('Falha no force_delete_test_clone RPC:', rpcError);
            throw new Error('Não foi possível remover o clone completamente. O banco de dados bloqueou a exclusão devido às travas de segurança médica. Certifique-se de ter rodado o script SQL no painel do Supabase.');
        }

        console.log(`[tempPatientCloner] Clone excluído com sucesso!`);
        return { success: true };
    } catch (error) {
        console.error('[tempPatientCloner] Falha ao tentar excluir clone forçadamente:', error);
        return { success: false, error };
    }
};
