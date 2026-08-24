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

        const cloneName = `(Cópia) ${originalProfile.name || 'Paciente'}`;
        
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

        const tableMap = {
            anthropometry: { table: 'growth_records', name: 'Antropometria' },
            energy_expenditures: { table: 'energy_expenditure_calculations', name: 'Gasto Energético' },
            goals: { table: 'goals', name: 'Metas' },
            lab_results: { table: 'lab_results', name: 'Exames Laboratoriais' },
            anamnesis_records: { table: 'anamnesis_records', name: 'Anamneses' },
        };

        for (const [optionKey, config] of Object.entries(tableMap)) {
            if (options[optionKey]) {
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
                        
                        if (clone.created_at) delete clone.created_at;
                        if (clone.updated_at) delete clone.updated_at;

                        if (config.table === 'goals') {
                            clone.energy_expenditure_id = null;
                            clone.meal_plan_id = null;
                        }
                        if (config.table === 'lab_results') {
                            clone.root_result_id = null;
                            clone.supersedes_result_id = null;
                        }
                        return clone;
                    });

                    const { error: insertError } = await supabase.from(config.table).insert(clones);
                    if (insertError) {
                        reportProgress(`Erro ao copiar ${config.name}`, 'error');
                        console.error(`[tempPatientCloner] Erro ao clonar a tabela ${config.table}:`, insertError);
                    } else {
                        reportProgress(`${config.name} copiadas com sucesso.`, 'success');
                    }
                } else {
                    reportProgress(`Nenhum registro de ${config.name} encontrado.`, 'success');
                }
            }
        }

        if (options.mealPlans) {
            reportProgress('Copiando Planos Alimentares...', 'loading');
            const { data: mealPlans } = await getMealPlans(originalPatientId);
            if (mealPlans && mealPlans.length > 0) {
                let successCount = 0;
                for (const plan of mealPlans) {
                    try {
                        await copyMealPlanToPatient(plan.id, newPatientId);
                        successCount++;
                    } catch (e) {
                        console.error('Falha ao copiar plano', e);
                    }
                }
                reportProgress(`${successCount}/${mealPlans.length} planos alimentares copiados.`, 'success');
            } else {
                reportProgress(`Nenhum plano alimentar encontrado.`, 'success');
            }
        }

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
        console.log(`[tempPatientCloner] Iniciando deleção forçada do clone ${patientId}...`);
        
        // Excluir registros dependentes para driblar a trava de "paciente vazio"
        const tablesToDelete = [
            'meal_plans',
            'goals',
            'lab_results',
            'energy_expenditure_calculations',
            'growth_records',
            'anamnesis_records'
        ];

        for (const table of tablesToDelete) {
            await supabase.from(table).delete().eq('patient_id', patientId);
        }

        console.log(`[tempPatientCloner] Registros dependentes excluídos. Removendo perfil principal...`);
        // Agora o paciente está vazio, podemos usar a exclusão nativa
        const { error: rpcError } = await removeEmptyPatient(patientId);
        if (rpcError) {
            console.error('Falha no removeEmptyPatient RPC, tentando delete direto...', rpcError);
            const { error: directError } = await supabase.from('user_profiles').delete().eq('id', patientId);
            if (directError) throw directError;
        }

        console.log(`[tempPatientCloner] Clone excluído com sucesso!`);
        return { success: true };
    } catch (error) {
        console.error('[tempPatientCloner] Falha ao tentar excluir clone forçadamente:', error);
        return { success: false, error };
    }
};
