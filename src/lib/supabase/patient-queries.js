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

/**
 * Busca TODAS as atividades de todos os pacientes do nutricionista
 * Feed completo tipo rede social com: refeições, anamnese, planos, consultas, mensagens, etc.
 * @param {string} nutritionistId - ID do nutricionista
 * @param {number} limit - Número de atividades a buscar
 * @returns {Promise<{data: array, error: object}>}
 */
/**
 * Detecta pacientes com baixa adesão (sem registros nas últimas 24-48h)
 * @param {string} nutritionistId - ID do nutricionista
 * @returns {Promise<{data: array, error: object}>}
 */
export const getPatientsWithLowAdherence = async (nutritionistId) => {
    try {
        // OTIMIZADO: Usa função SQL que faz tudo em 1 query ao invés de N+1
        const { data, error } = await supabase
            .rpc('get_patients_low_adherence_optimized', {
                p_nutritionist_id: nutritionistId,
                p_days_threshold: 2 // 2 dias = 48 horas
            });

        if (error) throw error;

        // Transformar resultado para manter compatibilidade com código existente
        const lowAdherencePatients = (data || []).map(patient => ({
            id: patient.patient_id,
            name: patient.patient_name,
            last_activity: patient.last_meal_date,
            days_inactive: patient.days_since_last_meal === 9999 ? null : patient.days_since_last_meal
        }));

        return { data: lowAdherencePatients, error: null };
    } catch (error) {
        console.error('Erro ao detectar baixa adesão:', error);
        return { data: [], error };
    }
};

/**
 * Detecta pacientes com dados essenciais pendentes
 * (anamnese, avaliação antropométrica, plano alimentar, cálculo de necessidades)
 * @param {string} nutritionistId - ID do nutricionista
 * @returns {Promise<{data: array, error: object}>}
 */
export const getPatientsPendingData = async (nutritionistId) => {
    try {
        // OTIMIZADO: Usa função SQL que faz 5 queries ao invés de 1+(4*N)
        const { data, error } = await supabase
            .rpc('get_patients_pending_data_optimized', {
                p_nutritionist_id: nutritionistId
            });

        if (error) throw error;

        // Transformar resultado para manter compatibilidade com código existente
        const pendingData = (data || []).map(patient => {
            const pending = [];

            // Converter array de strings em objetos com labels e rotas
            patient.pending_items.forEach(type => {
                const pendingMap = {
                    'anamnese': {
                        type: 'anamnesis',
                        label: 'Anamnese Pendente',
                        route: `/nutritionist/patients/${patient.patient_id}/anamnese`
                    },
                    'anthropometry': {
                        type: 'anthropometry',
                        label: 'Avaliação Antropométrica Pendente',
                        route: `/nutritionist/patients/${patient.patient_id}`
                    },
                    'meal_plan': {
                        type: 'meal_plan',
                        label: 'Plano Alimentar Pendente',
                        route: `/nutritionist/patients/${patient.patient_id}`
                    },
                    'prescription': {
                        type: 'prescription',
                        label: 'Cálculo de Necessidades Pendente',
                        route: `/nutritionist/patients/${patient.patient_id}`
                    }
                };

                if (pendingMap[type]) {
                    pending.push(pendingMap[type]);
                }
            });

            return {
                patient_id: patient.patient_id,
                patient_name: patient.patient_name,
                pending_items: pending
            };
        });

        return { data: pendingData, error: null };
    } catch (error) {
        console.error('Erro ao detectar pendências:', error);
        return { data: [], error };
    }
};

export const getComprehensiveActivityFeed = async (nutritionistId, limit = 20) => {
    try {
        // OTIMIZADO: Usa função SQL que consolida 8 queries em 1
        const { data, error } = await supabase
            .rpc('get_comprehensive_activity_feed_optimized', {
                p_nutritionist_id: nutritionistId,
                p_limit: limit
            });

        if (error) throw error;

        // Buscar avatares dos pacientes (cache-friendly)
        const patientIds = [...new Set(data?.map(a => a.patient_id) || [])];
        const { data: patientsData } = await supabase
            .from('user_profiles')
            .select('id, avatar_url')
            .in('id', patientIds);

        const avatarMap = Object.fromEntries((patientsData || []).map(p => [p.id, p.avatar_url]));

        // Transformar resultado SQL para formato compatível com código existente
        const activities = (data || []).map(activity => {
            const baseActivity = {
                id: `${activity.activity_type}-${activity.activity_id}`,
                type: activity.activity_type,
                patient_id: activity.patient_id,
                patient_name: activity.patient_name,
                patient_avatar: avatarMap[activity.patient_id] || null,
                timestamp: activity.activity_date,
                metadata: activity.activity_data
            };

            // Adicionar título e descrição específicos por tipo
            switch (activity.activity_type) {
                case 'meal':
                    return {
                        ...baseActivity,
                        title: 'Refeição Registrada',
                        description: `${activity.activity_data.meal_type} - ${activity.activity_data.total_calories || 0} kcal`
                    };
                case 'anthropometry':
                    const imc = activity.activity_data.height && activity.activity_data.weight
                        ? (activity.activity_data.weight / Math.pow(activity.activity_data.height / 100, 2)).toFixed(1)
                        : null;
                    return {
                        ...baseActivity,
                        title: 'Peso Registrado',
                        description: `Peso: ${activity.activity_data.weight} kg${imc ? ` - IMC: ${imc}` : ''}`
                    };
                case 'anamnesis':
                    return {
                        ...baseActivity,
                        title: 'Anamnese Preenchida',
                        description: 'Anamnese completa'
                    };
                case 'meal_plan':
                    return {
                        ...baseActivity,
                        title: 'Plano Alimentar Criado',
                        description: activity.activity_data.name
                    };
                case 'prescription':
                    return {
                        ...baseActivity,
                        title: 'Prescrição Nutricional',
                        description: `${activity.activity_data.calories || ''} kcal`
                    };
                case 'appointment':
                    return {
                        ...baseActivity,
                        title: 'Consulta Agendada',
                        description: activity.activity_data.notes || 'Consulta de acompanhamento'
                    };
                case 'chat':
                    return {
                        ...baseActivity,
                        type: 'message',
                        title: 'Mensagem Recebida',
                        description: activity.activity_data.message_preview || 'Mensagem'
                    };
                case 'achievement':
                    return {
                        ...baseActivity,
                        title: 'Conquista Desbloqueada',
                        description: activity.activity_data.achievement_name || 'Nova conquista'
                    };
                default:
                    return baseActivity;
            }
        });

        return { data: activities, error: null };
    } catch (error) {
        console.error('Erro ao buscar feed de atividades:', error);
        return { data: [], error };
    }
};
