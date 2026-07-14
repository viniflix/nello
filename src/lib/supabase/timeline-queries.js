import { supabase } from '@/lib/customSupabaseClient';
import { logSupabaseError } from '@/lib/supabase/query-helpers';

/**
 * ============================================================
 * TIMELINE QUERIES
 * ============================================================
 * Funções para recuperar e adaptar o histórico clínico e operacional
 * de um paciente para a visualização da Linha do Tempo (Onda C3).
 */

export const getPatientTimeline = async (patientId) => {
    try {
        // 1. Buscar registros clínicos (Evoluções / Anamneses)
        const { data: anamnesisRecords, error: anamnesisError } = await supabase
            .from('anamnesis_records')
            .select(`
                id, 
                date, 
                created_at, 
                status, 
                notes,
                template_id,
                public_access_token,
                template:anamnesis_templates ( id, title )
            `)
            .eq('patient_id', patientId);

        if (anamnesisError) throw anamnesisError;

        // 2. Buscar planos alimentares (Registros Legados / Operacionais)
        const { data: mealPlans, error: mealPlansError } = await supabase
            .from('meal_plans')
            .select(`
                id,
                name,
                description,
                start_date,
                created_at,
                is_active
            `)
            .eq('patient_id', patientId)
            .is('draft_id', null); // Não mostrar rascunhos na timeline

        if (mealPlansError) throw mealPlansError;

        // 3. Adaptar e Unificar
        const timeline = [];

        // Adaptar Anamneses
        if (anamnesisRecords) {
            anamnesisRecords.forEach(record => {
                timeline.push({
                    id: `anamnesis_${record.id}`,
                    originalId: record.id,
                    type: 'clinical',
                    subType: 'anamnesis',
                    title: record.template?.title || 'Evolução Clínica',
                    description: record.notes || (record.status === 'completed' ? 'Preenchido' : 'Em andamento'),
                    date: record.date || record.created_at, // Usa a data clínica, ou a de criação se faltar
                    created_at: record.created_at,
                    status: record.status,
                    isLegacy: false,
                    raw: record
                });
            });
        }

        // Adaptar Planos Alimentares
        if (mealPlans) {
            mealPlans.forEach(plan => {
                timeline.push({
                    id: `mealplan_${plan.id}`,
                    originalId: plan.id,
                    type: 'operational',
                    subType: 'meal_plan',
                    title: `Plano Alimentar: ${plan.name}`,
                    description: plan.description || 'Plano alimentar entregue ao paciente.',
                    date: plan.start_date || plan.created_at, // Usa a start_date, ou a de criação se faltar
                    created_at: plan.created_at,
                    status: plan.is_active ? 'active' : 'archived',
                    isLegacy: true, // Marcado como legado/adaptado
                    raw: plan
                });
            });
        }

        // 4. Ordenar do mais recente para o mais antigo
        timeline.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateB - dateA; // Decrescente
        });

        return { data: timeline, error: null };
    } catch (error) {
        logSupabaseError('Erro ao buscar linha do tempo do paciente', error);
        return { data: null, error };
    }
};
