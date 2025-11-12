import { supabase } from '@/lib/customSupabaseClient';

/**
 * Busca o perfil completo do paciente
 * @param {string} patientId - ID do paciente
 * @param {string} nutritionistId - ID do nutricionista (para validação de RLS)
 * @returns {Promise<{data: object, error: object}>}
 */
export const getPatientProfile = async (patientId, nutritionistId) => {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', patientId)
            .eq('nutritionist_id', nutritionistId)
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        console.error('Erro ao buscar perfil do paciente:', error);
        return { data: null, error };
    }
};

/**
 * Busca as últimas métricas do paciente (peso, altura, etc.)
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getLatestMetrics = async (patientId) => {
    try {
        // Buscar último registro de peso e altura do growth_records
        const { data: growthData, error: growthError } = await supabase
            .from('growth_records')
            .select('weight, height, record_date')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Se não encontrar em growth_records, buscar em user_profiles como fallback
        let weight = growthData?.weight;
        let height = growthData?.height;

        if (!weight || !height) {
            const { data: profileData } = await supabase
                .from('user_profiles')
                .select('weight, height')
                .eq('id', patientId)
                .single();

            weight = weight || profileData?.weight;
            height = height || profileData?.height;
        }

        // Buscar última consulta
        const { data: lastAppointment, error: lastAppError } = await supabase
            .from('appointments')
            .select('appointment_time, status')
            .eq('patient_id', patientId)
            .lte('appointment_time', new Date().toISOString())
            .order('appointment_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Buscar próxima consulta
        const { data: nextAppointment, error: nextAppError } = await supabase
            .from('appointments')
            .select('appointment_time, status')
            .eq('patient_id', patientId)
            .gte('appointment_time', new Date().toISOString())
            .order('appointment_time', { ascending: true })
            .limit(1)
            .maybeSingle();

        const metrics = {
            weight: weight || null,
            height: height || null,
            last_measurement: growthData?.record_date || null,
            last_appointment: lastAppointment
                ? new Date(lastAppointment.appointment_time).toLocaleDateString('pt-BR')
                : null,
            next_appointment: nextAppointment
                ? new Date(nextAppointment.appointment_time).toLocaleDateString('pt-BR')
                : null
        };

        return { data: metrics, error: null };
    } catch (error) {
        console.error('Erro ao buscar métricas do paciente:', error);
        return { data: null, error };
    }
};

/**
 * Busca o status de cada módulo do paciente
 * @param {string} patientId - ID do paciente
 * @returns {Promise<{data: object, error: object}>}
 */
export const getModulesStatus = async (patientId) => {
    try {
        // Verificar se tem anamnese
        const { data: anamneseData } = await supabase
            .from('anamnese_answers')
            .select('id')
            .eq('patient_id', patientId)
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

        // Verificar se tem refeições registradas
        const { data: mealsData } = await supabase
            .from('meals')
            .select('id')
            .eq('patient_id', patientId)
            .limit(1)
            .maybeSingle();

        // Verificar se tem conquistas
        const { data: achievementsData } = await supabase
            .from('user_achievements')
            .select('id')
            .eq('user_id', patientId)
            .limit(1)
            .maybeSingle();

        const status = {
            anamnese: anamneseData ? 'completed' : 'not_started',
            anthropometry: anthropometryData ? 'completed' : 'not_started',
            meal_plan: 'not_started', // Será implementado quando houver tabela de planos
            food_diary: mealsData ? 'completed' : 'not_started',
            lab_results: 'not_started', // Será implementado quando houver tabela de exames
            prescriptions: prescriptionData ? 'completed' : 'not_started',
            achievements: achievementsData ? 'completed' : 'not_started'
        };

        return { data: status, error: null };
    } catch (error) {
        console.error('Erro ao buscar status dos módulos:', error);
        return { data: null, error };
    }
};

/**
 * Busca atividades recentes do paciente
 * @param {string} patientId - ID do paciente
 * @param {number} limit - Número de atividades a buscar
 * @returns {Promise<{data: array, error: object}>}
 */
export const getPatientActivities = async (patientId, limit = 10) => {
    try {
        const activities = [];

        // Buscar últimas refeições (aumentado para cobrir mais tempo)
        const { data: mealsData } = await supabase
            .from('meals')
            .select('id, meal_type, created_at, total_calories')
            .eq('patient_id', patientId)
            .order('created_at', { ascending: false })
            .limit(30);

        if (mealsData) {
            mealsData.forEach((meal) => {
                activities.push({
                    id: `meal-${meal.id}`,
                    type: 'meal',
                    title: 'Refeição Registrada',
                    description: `${meal.meal_type} - ${meal.total_calories || 0} kcal`,
                    timestamp: meal.created_at,
                    metadata: [meal.meal_type, `${meal.total_calories || 0} kcal`]
                });
            });
        }

        // Buscar últimos registros de peso (aumentado para cobrir mais tempo)
        const { data: weightData } = await supabase
            .from('growth_records')
            .select('id, weight, height, record_date, created_at')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: false })
            .limit(20);

        if (weightData) {
            weightData.forEach((record) => {
                const imc = record.height
                    ? (record.weight / Math.pow(record.height / 100, 2)).toFixed(1)
                    : null;

                activities.push({
                    id: `weight-${record.id}`,
                    type: 'weight',
                    title: 'Peso Registrado',
                    description: `Peso: ${record.weight} kg`,
                    timestamp: record.created_at,
                    metadata: imc
                        ? [`${record.weight} kg`, `IMC: ${imc}`]
                        : [`${record.weight} kg`]
                });
            });
        }

        // Buscar conquistas (aumentado para cobrir mais tempo)
        const { data: achievementsData } = await supabase
            .from('user_achievements')
            .select('id, achievement_id, achieved_at, achievements(name)')
            .eq('user_id', patientId)
            .order('achieved_at', { ascending: false })
            .limit(15);

        if (achievementsData) {
            achievementsData.forEach((achievement) => {
                activities.push({
                    id: `achievement-${achievement.id}`,
                    type: 'achievement',
                    title: 'Conquista Desbloqueada',
                    description: achievement.achievements?.name || 'Nova conquista',
                    timestamp: achievement.achieved_at,
                    metadata: ['🏆 Conquista']
                });
            });
        }

        // Buscar consultas recentes (aumentado para cobrir mais tempo)
        const { data: appointmentsData } = await supabase
            .from('appointments')
            .select('id, appointment_time, status, notes')
            .eq('patient_id', patientId)
            .order('appointment_time', { ascending: false })
            .limit(15);

        if (appointmentsData) {
            appointmentsData.forEach((appointment) => {
                activities.push({
                    id: `appointment-${appointment.id}`,
                    type: 'appointment',
                    title: 'Consulta Realizada',
                    description: appointment.notes || 'Consulta de acompanhamento',
                    timestamp: appointment.appointment_time,
                    metadata: [appointment.status || 'Concluída']
                });
            });
        }

        // Ordenar todas as atividades por data
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Retornar apenas o limite solicitado
        return { data: activities.slice(0, limit), error: null };
    } catch (error) {
        console.error('Erro ao buscar atividades do paciente:', error);
        return { data: [], error };
    }
};

/**
 * Busca resumo completo do paciente (profile + metrics + status)
 * @param {string} patientId - ID do paciente
 * @param {string} nutritionistId - ID do nutricionista
 * @returns {Promise<{data: object, error: object}>}
 */
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

        return {
            data: {
                profile: profileResult.data,
                metrics: metricsResult.data || {},
                modulesStatus: statusResult.data || {}
            },
            error: null
        };
    } catch (error) {
        console.error('Erro ao buscar resumo do paciente:', error);
        return { data: null, error };
    }
};
