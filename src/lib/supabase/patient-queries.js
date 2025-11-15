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
        // Buscar todos os pacientes ativos do nutricionista
        const { data: patients } = await supabase
            .from('user_profiles')
            .select('id, name')
            .eq('nutritionist_id', nutritionistId)
            .eq('user_type', 'patient')
            .eq('is_active', true);

        if (!patients || patients.length === 0) {
            return { data: [], error: null };
        }

        const lowAdherencePatients = [];
        const now = new Date();
        const threshold48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

        // Verificar última atividade de cada paciente
        for (const patient of patients) {
            const { data: lastMeal } = await supabase
                .from('meals')
                .select('created_at')
                .eq('patient_id', patient.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // Se não tem refeição OU última refeição foi há mais de 48h
            if (!lastMeal || new Date(lastMeal.created_at) < threshold48h) {
                lowAdherencePatients.push({
                    id: patient.id,
                    name: patient.name,
                    last_activity: lastMeal?.created_at || null,
                    days_inactive: lastMeal
                        ? Math.floor((now - new Date(lastMeal.created_at)) / (1000 * 60 * 60 * 24))
                        : null
                });
            }
        }

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
        // Buscar todos os pacientes ativos do nutricionista
        const { data: patients } = await supabase
            .from('user_profiles')
            .select('id, name')
            .eq('nutritionist_id', nutritionistId)
            .eq('user_type', 'patient')
            .eq('is_active', true);

        if (!patients || patients.length === 0) {
            return { data: [], error: null };
        }

        const pendingData = [];

        // Verificar pendências de cada paciente
        for (const patient of patients) {
            const pending = [];

            // Verificar ANAMNESE
            const { data: anamneseData } = await supabase
                .from('anamnesis_records')
                .select('id')
                .eq('patient_id', patient.id)
                .limit(1)
                .maybeSingle();

            if (!anamneseData) {
                pending.push({
                    type: 'anamnesis',
                    label: 'Anamnese Pendente',
                    route: `/nutritionist/patients/${patient.id}/anamnese`
                });
            }

            // Verificar AVALIAÇÃO ANTROPOMÉTRICA
            const { data: anthropometryData } = await supabase
                .from('growth_records')
                .select('id')
                .eq('patient_id', patient.id)
                .limit(1)
                .maybeSingle();

            if (!anthropometryData) {
                pending.push({
                    type: 'anthropometry',
                    label: 'Avaliação Antropométrica Pendente',
                    route: `/nutritionist/patients/${patient.id}`
                });
            }

            // Verificar PLANO ALIMENTAR
            const { data: mealPlanData } = await supabase
                .from('meal_plans')
                .select('id')
                .eq('patient_id', patient.id)
                .limit(1)
                .maybeSingle();

            if (!mealPlanData) {
                pending.push({
                    type: 'meal_plan',
                    label: 'Plano Alimentar Pendente',
                    route: `/nutritionist/patients/${patient.id}`
                });
            }

            // Verificar PRESCRIÇÃO (Cálculo de Necessidades)
            const { data: prescriptionData } = await supabase
                .from('prescriptions')
                .select('id')
                .eq('patient_id', patient.id)
                .limit(1)
                .maybeSingle();

            if (!prescriptionData) {
                pending.push({
                    type: 'prescription',
                    label: 'Cálculo de Necessidades Pendente',
                    route: `/nutritionist/patients/${patient.id}`
                });
            }

            // Se tem pendências, adicionar à lista
            if (pending.length > 0) {
                pendingData.push({
                    patient_id: patient.id,
                    patient_name: patient.name,
                    pending_items: pending
                });
            }
        }

        return { data: pendingData, error: null };
    } catch (error) {
        console.error('Erro ao detectar pendências:', error);
        return { data: [], error };
    }
};

export const getComprehensiveActivityFeed = async (nutritionistId, limit = 20) => {
    try {
        const activities = [];

        // Buscar pacientes do nutricionista para filtrar
        const { data: patientsData } = await supabase
            .from('user_profiles')
            .select('id, name, avatar_url')
            .eq('nutritionist_id', nutritionistId)
            .eq('user_type', 'patient');

        if (!patientsData || patientsData.length === 0) {
            return { data: [], error: null };
        }

        const patientIds = patientsData.map(p => p.id);
        const patientMap = Object.fromEntries(patientsData.map(p => [p.id, p]));

        // Buscar todas as atividades em paralelo
        const [mealsData, anthropometryData, anamnesisData, mealPlansData, prescriptionsData, appointmentsData, chatsData, achievementsData] = await Promise.all([
            // 1. REFEIÇÕES
            supabase
                .from('meals')
                .select('id, patient_id, meal_type, total_calories, created_at')
                .in('patient_id', patientIds)
                .order('created_at', { ascending: false })
                .limit(50),

            // 2. AVALIAÇÕES ANTROPOMÉTRICAS
            supabase
                .from('growth_records')
                .select('id, patient_id, weight, height, created_at')
                .in('patient_id', patientIds)
                .order('created_at', { ascending: false })
                .limit(30),

            // 3. ANAMNESE
            supabase
                .from('anamnesis_records')
                .select('id, patient_id, template_id, version, status, created_at')
                .in('patient_id', patientIds)
                .order('created_at', { ascending: false })
                .limit(20),

            // 4. PLANOS ALIMENTARES
            supabase
                .from('meal_plans')
                .select('id, patient_id, name, daily_calories, is_active, created_at')
                .in('patient_id', patientIds)
                .order('created_at', { ascending: false })
                .limit(20),

            // 5. PRESCRIÇÕES
            supabase
                .from('prescriptions')
                .select('id, patient_id, calories, diet_type, created_at')
                .in('patient_id', patientIds)
                .order('created_at', { ascending: false })
                .limit(20),

            // 6. CONSULTAS
            supabase
                .from('appointments')
                .select('id, patient_id, appointment_time, notes, status, created_at')
                .eq('nutritionist_id', nutritionistId)
                .order('created_at', { ascending: false })
                .limit(30),

            // 7. MENSAGENS
            supabase
                .from('chats')
                .select('id, from_id, to_id, message, message_type, created_at')
                .or(`from_id.eq.${nutritionistId},to_id.eq.${nutritionistId}`)
                .order('created_at', { ascending: false })
                .limit(50),

            // 8. CONQUISTAS
            supabase
                .from('user_achievements')
                .select('id, user_id, achievement_id, achieved_at, achievements(name)')
                .in('user_id', patientIds)
                .order('achieved_at', { ascending: false })
                .limit(20)
        ]);

        // Processar REFEIÇÕES
        if (mealsData.data) {
            mealsData.data.forEach(meal => {
                const patient = patientMap[meal.patient_id];
                if (patient) {
                    activities.push({
                        id: `meal-${meal.id}`,
                        type: 'meal',
                        title: 'Refeição Registrada',
                        description: `${meal.meal_type} - ${meal.total_calories || 0} kcal`,
                        patient_id: meal.patient_id,
                        patient_name: patient.name,
                        patient_avatar: patient.avatar_url,
                        timestamp: meal.created_at,
                        metadata: {
                            meal_type: meal.meal_type,
                            calories: meal.total_calories,
                            meal_id: meal.id
                        }
                    });
                }
            });
        }

        // Processar AVALIAÇÕES ANTROPOMÉTRICAS
        if (anthropometryData.data) {
            anthropometryData.data.forEach(record => {
                const patient = patientMap[record.patient_id];
                if (patient) {
                    const imc = record.height
                        ? (record.weight / Math.pow(record.height / 100, 2)).toFixed(1)
                        : null;

                    activities.push({
                        id: `anthropometry-${record.id}`,
                        type: 'anthropometry',
                        title: 'Peso Registrado',
                        description: `Peso: ${record.weight} kg${imc ? ` - IMC: ${imc}` : ''}`,
                        patient_id: record.patient_id,
                        patient_name: patient.name,
                        patient_avatar: patient.avatar_url,
                        timestamp: record.created_at,
                        metadata: {
                            weight: record.weight,
                            height: record.height,
                            imc,
                            record_id: record.id
                        }
                    });
                }
            });
        }

        // Processar ANAMNESE
        if (anamnesisData.data) {
            anamnesisData.data.forEach(anamnesis => {
                const patient = patientMap[anamnesis.patient_id];
                if (patient) {
                    activities.push({
                        id: `anamnesis-${anamnesis.id}`,
                        type: 'anamnesis',
                        title: 'Anamnese Preenchida',
                        description: `Versão: ${anamnesis.version || 1}${anamnesis.status ? ` - ${anamnesis.status}` : ''}`,
                        patient_id: anamnesis.patient_id,
                        patient_name: patient.name,
                        patient_avatar: patient.avatar_url,
                        timestamp: anamnesis.created_at,
                        metadata: {
                            template_id: anamnesis.template_id,
                            status: anamnesis.status,
                            record_id: anamnesis.id
                        }
                    });
                }
            });
        }

        // Processar PLANOS ALIMENTARES
        if (mealPlansData.data) {
            mealPlansData.data.forEach(plan => {
                const patient = patientMap[plan.patient_id];
                if (patient) {
                    activities.push({
                        id: `meal-plan-${plan.id}`,
                        type: 'meal_plan',
                        title: 'Plano Alimentar Criado',
                        description: `${plan.name}${plan.daily_calories ? ` - ${plan.daily_calories} kcal/dia` : ''}`,
                        patient_id: plan.patient_id,
                        patient_name: patient.name,
                        patient_avatar: patient.avatar_url,
                        timestamp: plan.created_at,
                        metadata: {
                            plan_name: plan.name,
                            calories: plan.daily_calories,
                            is_active: plan.is_active,
                            plan_id: plan.id
                        }
                    });
                }
            });
        }

        // Processar PRESCRIÇÕES
        if (prescriptionsData.data) {
            prescriptionsData.data.forEach(prescription => {
                const patient = patientMap[prescription.patient_id];
                if (patient) {
                    activities.push({
                        id: `prescription-${prescription.id}`,
                        type: 'prescription',
                        title: 'Prescrição Nutricional',
                        description: `${prescription.calories || ''} kcal - ${prescription.diet_type || 'Dieta personalizada'}`,
                        patient_id: prescription.patient_id,
                        patient_name: patient.name,
                        patient_avatar: patient.avatar_url,
                        timestamp: prescription.created_at,
                        metadata: {
                            calories: prescription.calories,
                            diet_type: prescription.diet_type,
                            prescription_id: prescription.id
                        }
                    });
                }
            });
        }

        // Processar CONSULTAS
        if (appointmentsData.data) {
            appointmentsData.data.forEach(appointment => {
                const patient = patientMap[appointment.patient_id];
                if (patient) {
                    activities.push({
                        id: `appointment-${appointment.id}`,
                        type: 'appointment',
                        title: 'Consulta Agendada',
                        description: appointment.notes || 'Consulta de acompanhamento',
                        patient_id: appointment.patient_id,
                        patient_name: patient.name,
                        patient_avatar: patient.avatar_url,
                        timestamp: appointment.created_at,
                        metadata: {
                            appointment_time: appointment.appointment_time,
                            status: appointment.status,
                            appointment_id: appointment.id
                        }
                    });
                }
            });
        }

        // Processar MENSAGENS
        if (chatsData.data) {
            chatsData.data.forEach(chat => {
                const isFromNutritionist = chat.from_id === nutritionistId;
                const patientId = isFromNutritionist ? chat.to_id : chat.from_id;
                const patient = patientMap[patientId];

                if (patient) {
                    let description = '';
                    switch (chat.message_type) {
                        case 'text':
                            description = chat.message?.substring(0, 100) || 'Mensagem';
                            break;
                        case 'image':
                            description = '📷 Imagem';
                            break;
                        case 'audio':
                            description = '🎤 Áudio';
                            break;
                        default:
                            description = 'Mensagem';
                    }

                    activities.push({
                        id: `chat-${chat.id}`,
                        type: 'message',
                        title: isFromNutritionist ? 'Você enviou uma mensagem' : 'Mensagem Recebida',
                        description,
                        patient_id: patientId,
                        patient_name: patient.name,
                        patient_avatar: patient.avatar_url,
                        timestamp: chat.created_at,
                        metadata: {
                            message_type: chat.message_type,
                            from_nutritionist: isFromNutritionist,
                            chat_id: chat.id
                        }
                    });
                }
            });
        }

        // Processar CONQUISTAS
        if (achievementsData.data) {
            achievementsData.data.forEach(achievement => {
                const patient = patientMap[achievement.user_id];
                if (patient) {
                    activities.push({
                        id: `achievement-${achievement.id}`,
                        type: 'achievement',
                        title: 'Conquista Desbloqueada',
                        description: achievement.achievements?.name || 'Nova conquista',
                        patient_id: achievement.user_id,
                        patient_name: patient.name,
                        patient_avatar: patient.avatar_url,
                        timestamp: achievement.achieved_at,
                        metadata: {
                            achievement_name: achievement.achievements?.name,
                            achievement_id: achievement.achievement_id
                        }
                    });
                }
            });
        }

        // Ordenar todas as atividades por timestamp (mais recentes primeiro)
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Retornar apenas o limite solicitado
        return { data: activities.slice(0, limit), error: null };
    } catch (error) {
        console.error('Erro ao buscar feed de atividades:', error);
        return { data: [], error };
    }
};
