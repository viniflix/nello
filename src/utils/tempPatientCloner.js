import { supabase } from '@/lib/customSupabaseClient';
import { getPatientProfile } from '@/lib/supabase/patient-queries';
import { getMealPlans, copyMealPlanToPatient } from '@/lib/supabase/meal-plan-queries';

export const duplicatePatientTemporarily = async (originalPatientId, nutritionistId) => {
    try {
        console.log('[tempPatientCloner] Buscando dados do paciente original...');
        const { data: originalProfile, error: profileError } = await getPatientProfile(originalPatientId, nutritionistId);
        if (profileError || !originalProfile) throw new Error('Não foi possível carregar o perfil original.');

        const cloneName = `(Cópia) ${originalProfile.name || 'Paciente'}`;
        
        console.log('[tempPatientCloner] Criando novo paciente via Edge Function...');
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

        console.log(`[tempPatientCloner] Novo paciente criado com ID: ${newPatientId}`);

        // Array de tabelas que iremos clonar simplesmente trocando o patient_id
        const tablesToClone = [
            'anthropometry',
            'energy_expenditures',
            'goals',
            'lab_results',
            'anamnesis_records'
        ];

        for (const table of tablesToClone) {
            console.log(`[tempPatientCloner] Clonando registros da tabela: ${table}...`);
            const { data: records } = await supabase
                .from(table)
                .select('*')
                .eq('patient_id', originalPatientId);

            if (records && records.length > 0) {
                const clones = records.map(record => {
                    const clone = { ...record };
                    delete clone.id; // Remover ID original para o banco gerar um novo
                    clone.patient_id = newPatientId;
                    
                    // Tratativas específicas de chave ou limpeza de campos não necessários na cópia pura
                    if (clone.created_at) delete clone.created_at;
                    if (clone.updated_at) delete clone.updated_at;

                    return clone;
                });

                const { error: insertError } = await supabase.from(table).insert(clones);
                if (insertError) {
                    console.error(`[tempPatientCloner] Erro ao clonar a tabela ${table}:`, insertError);
                }
            }
        }

        // Clonar planos alimentares (Tabela relacional complexa, usamos a função pronta)
        console.log('[tempPatientCloner] Clonando planos alimentares...');
        const { data: mealPlans } = await getMealPlans(originalPatientId);
        if (mealPlans && mealPlans.length > 0) {
            for (const plan of mealPlans) {
                await copyMealPlanToPatient(plan.id, newPatientId);
            }
        }

        console.log('[tempPatientCloner] Paciente duplicado com sucesso!');
        return { success: true, newPatientId };

    } catch (error) {
        console.error('[tempPatientCloner] Falha geral ao duplicar:', error);
        return { success: false, error };
    }
};
