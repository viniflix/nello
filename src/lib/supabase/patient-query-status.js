

import { supabase } from '@/lib/customSupabaseClient';

import { logSupabaseError } from '@/lib/supabase/query-helpers';



import { listClinicalRecordsByEpisode } from '@/features/clinical-records/api/evolution-queries';
import {getPatientProfile,getLatestMetrics} from './patient-query-history';
export const getPatientHubOperationalContext = async (patientId, nutritionistId, episodeId = null) => {
    if (!patientId || !nutritionistId) return { data: null, error: null };

    const now = new Date();
    const nowIso = now.toISOString();
    const upcomingAppointmentStatuses = ['scheduled', 'confirmed', 'awaiting_confirmation'];
    const partialErrors = [];

    const hubReadOperations = {
  "planos alimentares": "erro_ao_carregar_planos_alimentares_do_hub",
  "refeições do plano": "erro_ao_carregar_refeicoes_do_plano_do_hub",
  "próxima consulta": "erro_ao_carregar_proxima_consulta_do_hub",
  "última consulta": "erro_ao_carregar_ultima_consulta_do_hub",
  "check-in mais recente": "erro_ao_carregar_check_in_mais_recente_do_hub",
  "meta ativa": "erro_ao_carregar_meta_ativa_do_hub",
  "resumo semanal": "erro_ao_carregar_resumo_semanal_do_hub",
  "registro clínico mais recente": "erro_ao_carregar_registro_clinico_mais_recente_do_hub"
};
    const read = (result, fallback, label) => {
        if (result?.error) {
            partialErrors.push(label);
            logSupabaseError(hubReadOperations[label] || 'patient_hub.unknown_read', result.error);
            return fallback;
        }
        return result?.data ?? fallback;
    };

    try {
        const [plansResult, nextAppointmentResult, lastAppointmentResult, checkinResult, goalResult, weeklySummaryResult, clinicalRecordResult] = await Promise.all([
            supabase
                .from('meal_plans')
                .select('id, name, start_date, end_date, is_active, is_draft, prescription_status, daily_calories, daily_protein, daily_carbs, daily_fat, updated_at, archived_at')
                .eq('patient_id', patientId)
                .eq('nutritionist_id', nutritionistId)
                .is('archived_at', null)
                .order('updated_at', { ascending: false })
                .limit(20),
            supabase
                .from('appointments')
                .select('id, start_time, appointment_time, duration, appointment_type, status, notes')
                .eq('patient_id', patientId)
                .eq('nutritionist_id', nutritionistId)
                .in('status', upcomingAppointmentStatuses)
                .gte('start_time', nowIso)
                .order('start_time', { ascending: true })
                .limit(1)
                .maybeSingle(),
            supabase
                .from('appointments')
                .select('id, start_time, appointment_time, duration, appointment_type, status, notes')
                .eq('patient_id', patientId)
                .eq('nutritionist_id', nutritionistId)
                .eq('status', 'completed')
                .lt('start_time', nowIso)
                .order('start_time', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabase
                .from('checkin_sessions')
                .select('id, status, completed_at, sent_at, adherence_percentage, score_total, score_max')
                .eq('patient_id', patientId)
                .eq('nutritionist_id', nutritionistId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabase
                .from('patient_goals')
                .select('id, title, goal_type, status, progress_percentage, target_date, updated_at')
                .eq('patient_id', patientId)
                .eq('nutritionist_id', nutritionistId)
                .eq('status', 'active')
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle(),
            supabase
                .from('weekly_summaries')
                .select('id, week_start_date, notes, goals_met, updated_at')
                .eq('patient_id', patientId)
                .eq('nutritionist_id', nutritionistId)
                .order('week_start_date', { ascending: false })
                .limit(1)
                .maybeSingle(),
            episodeId
                ? listClinicalRecordsByEpisode(patientId, episodeId)
                : Promise.resolve({ data: [], error: null })
        ]);

        const plans = read(plansResult, [], 'planos alimentares');
        const draftPlan = plans.find((plan) => plan.is_draft) || null;
        const activePlan = plans.find((plan) => plan.is_active && !plan.is_draft) || null;
        const displayedPlan = draftPlan || activePlan;

        let meals = [];
        let foodCount = 0;
        if (displayedPlan?.id) {
            const mealsResult = await supabase
                .from('meal_plan_meals')
                .select('id, name, meal_type, meal_time, order_index, total_calories, total_protein, total_carbs, total_fat')
                .eq('meal_plan_id', displayedPlan.id)
                .order('order_index', { ascending: true });
            meals = read(mealsResult, [], 'refeições do plano');

            const mealIds = meals.map((meal) => meal.id).filter(Boolean);
            if (mealIds.length > 0) {
                const foodCountResult = await supabase
                    .from('meal_plan_foods')
                    .select('id', { count: 'exact', head: true })
                    .in('meal_plan_meal_id', mealIds);
                if (foodCountResult.error) {
                    partialErrors.push('alimentos do plano');
                    foodCount = null;
                    logSupabaseError("erro_ao_contar_alimentos_do_plano_no_hub", foodCountResult.error);
                }
                else foodCount = foodCountResult.count || 0;
            }
        }

        const planStatus = plansResult.error ? 'unknown' : draftPlan
            ? 'draft'
            : activePlan?.prescription_status === 'finalized'
                ? 'active'
                : activePlan
                    ? 'review'
                    : 'missing';

        return {
            data: {
                plans,
                partialErrors,
                activePlan,
                draftPlan,
                displayedPlan,
                planStatus,
                meals,
                mealCount: partialErrors.includes('refeições do plano') ? null : meals.length,
                foodCount,
                nextAppointment: read(nextAppointmentResult, null, 'próxima consulta'),
                lastAppointment: read(lastAppointmentResult, null, 'última consulta'),
                latestCheckin: read(checkinResult, null, 'check-in mais recente'),
                activeGoal: read(goalResult, null, 'meta ativa'),
                latestWeeklySummary: read(weeklySummaryResult, null, 'resumo semanal'),
                latestClinicalRecord: read(clinicalRecordResult, [], 'registro clínico mais recente')
                    .reduce((latest, record) => !latest || new Date(record.recorded_at || record.created_at) > new Date(latest.recorded_at || latest.created_at) ? record : latest, null)
            },
            error: null
        };
    } catch (error) {
        logSupabaseError("erro_ao_carregar_contexto_operacional_do_hub", error);
        return { data: null, error };
    }
};

export const getModulesStatus = async (patientId) => {
    try {
        // A anamnese atual é versionada em anamnesis_records. O antigo modelo
        // EAV (anamnese_answers) foi removido do banco e não deve ser consultado.
        const { data: anamneseData } = await supabase
            .from('anamnesis_records')
            .select('id')
            .eq('patient_id', patientId)
            .in('status', ['completed', 'validated'])
            .limit(1)
            .maybeSingle();

        // Verificar se tem avaliação antropométrica
        const { data: anthropometryData } = await supabase
            .from('growth_records')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem prescrição
        const { data: prescriptionData } = await supabase
            .from('prescriptions')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem refeições registradas (não deletadas)
        const { data: mealsData } = await supabase
            .from('meals')
            .select('id')
            .eq('patient_id', patientId)
            .is('deleted_at', null)
            .limit(1)
            .maybeSingle();

        // Verificar se tem conquistas
        const { data: achievementsData } = await supabase
            .from('user_achievements')
            .select('id')
            .eq('user_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem gasto energético calculado
        const { data: energyData } = await supabase
            .from('energy_expenditure_calculations')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem exames laboratoriais
        const { data: labResultsData } = await supabase
            .from('lab_results')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        const status = {
            anamnese: anamneseData ? 'completed' : 'not_started',
            anthropometry: anthropometryData ? 'completed' : 'not_started',
            energy_expenditure: energyData ? 'completed' : 'not_started',
            meal_plan: prescriptionData ? 'completed' : 'not_started',
            food_diary: mealsData ? 'completed' : 'not_started',
            lab_results: labResultsData ? 'completed' : 'not_started',
            prescriptions: prescriptionData ? 'completed' : 'not_started',
            achievements: achievementsData ? 'completed' : 'not_started'
        };

        return { data: status, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_status_dos_modulos", error);
        return { data: null, error };
    }
};

export const getPatientSummary = async (patientId, nutritionistId) => {
    try {
        const [profileResult, metricsResult, statusResult] = await Promise.all([
            getPatientProfile(patientId, nutritionistId),
            getLatestMetrics(patientId),
            getModulesStatus(patientId)
        ]);

        if (profileResult.error) {
            throw profileResult.error;
        }

        const profile = profileResult.data || {};
        const metrics = metricsResult.data || {};

        if (!profile.birth_date && metrics.birth_date_from_anamnesis) {
            profile.birth_date = metrics.birth_date_from_anamnesis;
        }

        return {
            data: {
                profile,
                metrics,
                modulesStatus: statusResult.data || {}
            },
            error: null
        };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_resumo_do_paciente", error);
        return { data: null, error };
    }
};
