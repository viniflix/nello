

import { supabase } from '@/lib/customSupabaseClient';
import { translateMealType } from '@/utils/mealTranslations';
import { buildActivityEventPayload, logSupabaseError } from '@/lib/supabase/query-helpers';

import { isUuid } from '@/lib/utils/patientRoutes';



export let hasActivityLogTable = true;

export const getProgressPhotoEventsFromAudit = async (patientId) => {
    if (!hasActivityLogTable || !patientId) return [];

    const { data, error } = await supabase
        .from('activity_log')
        .select('id, event_name, occurred_at, payload')
        .eq('patient_id', patientId)
        .in('event_name', ['progress_photo.added', 'progress_photo.edited', 'progress_photo.deleted'])
        .order('occurred_at', { ascending: false })
        .limit(20);

    if (error) {
        const msg = String(error?.message || '').toLowerCase();
        const code = String(error?.code || '').toUpperCase();
        const isMissingRelation =
            code === 'PGRST205' ||
            code === 'PGRST204' ||
            code === '42P01' ||
            (msg.includes('activity_log') && (msg.includes('schema cache') || msg.includes('does not exist')));

        if (isMissingRelation) {
            hasActivityLogTable = false;
            return [];
        }
        // Supabase/PostgREST 404 = tabela não existe
        if (error?.status === 404 || error?.statusCode === 404) {
            hasActivityLogTable = false;
            return [];
        }
        throw error;
    }

    return data || [];
};

export const resolvePatientId = async (slugOrId, nutritionistId) => {
    if (!slugOrId || !nutritionistId) return { patientId: null, error: null };
    if (isUuid(slugOrId)) return { patientId: slugOrId, error: null };
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('slug', slugOrId)
            .eq('nutritionist_id', nutritionistId)
            .maybeSingle();
        if (error) throw error;
        return { patientId: data?.id || null, error: null };
    } catch (err) {
        logSupabaseError("erro_ao_resolver_slug_do_paciente", err);
        return { patientId: null, error: err };
    }
};

export const getPatientProfile = async (patientId, nutritionistId) => {
    try {
        const { data, error } = await supabase.rpc('get_care_patient_profile', {
            p_patient_id: patientId
        });

        if (error) throw error;
        if (!data) throw new Error('Perfil de atendimento não encontrado.');
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_perfil_do_paciente", error);
        return { data: null, error };
    }
};

export const updatePatientProfile = async (patientId, updateData) => {
    try {
        const { data, error } = await supabase
            .from('user_profiles')
            .update(updateData)
            .eq('id', patientId)
            .select("id,name,user_type,crn,birth_date,gender,height,weight,goal,nutritionist_id,created_at,patient_category,fiscal_data,preferences,avatar_url,phone,address,specialties,education,bio,is_active,cpf,occupation,civil_status,email,observations,is_admin,clinic_settings,slug,invite_code,patient_invite_code,needs_password_reset,ethnicity,last_seen_at,clinical_flags,is_simulation,simulation_owner_id")
            .single();

        if (error) throw error;
        return { data, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_atualizar_perfil_do_paciente", error);
        return { data: null, error };
    }
};

export const getLatestMetrics = async (patientId) => {
    try {
        // 1. Buscar registros antropométricos (growth_records) - colunas essenciais para compatibilidade
        const { data: growthRows } = await supabase
            .from('growth_records')
            .select('weight, height, record_date')
            .eq('patient_id', patientId)
            .order('record_date', { ascending: false })
            .limit(2);

        const growthData = growthRows?.[0] || null;
        const previousGrowthData = growthRows?.[1] || null;

        let weight = growthData?.weight;
        let height = growthData?.height;

        // 2. Fallback: user_profiles
        if (!weight || !height) {
            const { data: profileData } = await supabase
                .from('user_profiles')
                .select('weight, height')
                .eq('id', patientId)
                .single();

            weight = weight || profileData?.weight;
            height = height || profileData?.height;
        }

        // 3. Fallback peso será preenchido no bloco 4 a partir da anamnese

        // 4. Anamnese: peso, objetivo e data_nascimento (ecossistema integrado)
        let goalFromAnamnesis = null;
        let birthDateFromAnamnesis = null;
        const { data: anamnesisDataFull } = await supabase
            .from('anamnesis_records')
            .select('content')
            .eq('patient_id', patientId)
            .order('date', { ascending: false })
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle();

        const content = anamnesisDataFull?.content || {};
        const objetivoTexto = content?.objetivos?.objetivo_principal;
        if (objetivoTexto && typeof objetivoTexto === 'string' && objetivoTexto.length > 0) {
            const txt = objetivoTexto.toLowerCase();
            if (txt.includes('perder') || txt.includes('emagrec')) goalFromAnamnesis = 'lose';
            else if (txt.includes('ganhar') || txt.includes('hipertrof')) goalFromAnamnesis = 'gain';
            else if (txt.includes('manter') || txt.includes('recompos')) goalFromAnamnesis = 'maintain';
            else goalFromAnamnesis = objetivoTexto.slice(0, 50);
        }
        const dtNasc = content?.identificacao?.data_nascimento;
        if (dtNasc && typeof dtNasc === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dtNasc)) birthDateFromAnamnesis = dtNasc;
            else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dtNasc)) {
                const [d, m, y] = dtNasc.split('/');
                birthDateFromAnamnesis = `${y}-${m}-${d}`;
            }
        }

        const pesoAtualAnamnesis = content?.objetivos?.peso_atual;
        if (!weight && pesoAtualAnamnesis && parseFloat(pesoAtualAnamnesis) > 0) {
            weight = parseFloat(pesoAtualAnamnesis);
        }

        // Buscar última consulta
        const { data: lastAppointment } = await supabase
            .from('appointments')
            .select('start_time, status')
            .eq('patient_id', patientId)
            .lte('start_time', new Date().toISOString())
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Buscar próxima consulta
        const { data: nextAppointment } = await supabase
            .from('appointments')
            .select('start_time, status')
            .eq('patient_id', patientId)
            .gte('start_time', new Date().toISOString())
            .order('start_time', { ascending: true })
            .limit(1)
            .maybeSingle();

        const metrics = {
            weight: weight || null,
            height: height || null,
            previous_weight: previousGrowthData?.weight || null,
            last_measurement: growthData?.record_date || null,
            updated_at: growthData?.record_date ? new Date(growthData.record_date).toISOString() : null,
            created_at: growthData?.record_date ? new Date(growthData.record_date).toISOString() : null,
            goal: goalFromAnamnesis,
            birth_date_from_anamnesis: birthDateFromAnamnesis || null,
            last_appointment: lastAppointment
                ? new Date(lastAppointment.start_time).toLocaleDateString('pt-BR')
                : null,
            next_appointment: nextAppointment
                ? new Date(nextAppointment.start_time).toLocaleDateString('pt-BR')
                : null
        };

        return { data: metrics, error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_metricas_do_paciente", error);
        return { data: null, error };
    }
};

export const getPatientActivities = async (patientId, limit = 10) => {
    if (!patientId) return { data: [], error: null };
    try {
        const activities = [];

        // These sources are independent. Read them together so the feed waits for
        // one network round trip rather than seven consecutive round trips.
        const [mealAuditResult, weightResult, anamnesisResult, energyResult, photoEvents, achievementsResult, appointmentsResult] = await Promise.all([
            supabase.from('meal_audit_log').select('id, action, meal_type, details, created_at').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(30),
            supabase.from('growth_records').select('id, weight, height, record_date, created_at').eq('patient_id', patientId).order('record_date', { ascending: false }).limit(20),
            supabase.from('anamnesis_records').select('id, date, created_at').eq('patient_id', patientId).order('date', { ascending: false }).limit(15),
            supabase.from('energy_expenditure_calculations').select('id, created_at, final_planned_kcal').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(5),
            getProgressPhotoEventsFromAudit(patientId).catch((error) => {
                logSupabaseError("erro_ao_buscar_auditoria_de_fotos_no_activity_log", error);
                return [];
            }),
            supabase.from('user_achievements').select('id, achievement_id, achieved_at, achievements(name)').eq('user_id', patientId).order('achieved_at', { ascending: false }).limit(15),
            supabase.from('appointments').select('id, start_time, status, notes').eq('patient_id', patientId).order('start_time', { ascending: false }).limit(15),
        ]);

        // Buscar auditoria de refeições (CREATE, UPDATE, DELETE)
        const { data: mealAuditData } = mealAuditResult;

        if (mealAuditData) {
            mealAuditData.forEach((audit) => {
                const totalCalories = audit.details?.total_calories || 0;
                const mealTypeTranslated = translateMealType(audit.meal_type);

                let title = '';
                let description = '';

                if (audit.action === 'create') {
                    title = 'Refeição Registrada';
                    description = `${mealTypeTranslated} - ${totalCalories} kcal`;
                } else if (audit.action === 'update') {
                    title = 'Refeição Editada';
                    description = `${mealTypeTranslated} - ${totalCalories} kcal`;
                } else if (audit.action === 'delete') {
                    title = 'Refeição Deletada';
                    description = `${mealTypeTranslated} - ${totalCalories} kcal`;
                }

                activities.push({
                    id: `audit-${audit.id}`,
                    type: 'meal',
                    title: title,
                    description: description,
                    timestamp: audit.created_at,
                    metadata: [mealTypeTranslated, `${totalCalories} kcal`, audit.action === 'create' ? 'Registrado' : audit.action === 'update' ? 'Editado' : 'Deletado'],
                    linkPath: 'food-diary'
                });
            });
        }

        // Buscar últimos registros de peso (aumentado para cobrir mais tempo)
        const { data: weightData } = weightResult;

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
                        : [`${record.weight} kg`],
                    linkPath: 'anthropometry'
                });
            });
        }

        // Anamnese respondida
        const { data: anamnesisData } = anamnesisResult;

        if (anamnesisData) {
            anamnesisData.forEach((rec) => {
                activities.push({
                    id: `anamnesis-${rec.id}`,
                    type: 'anamnese',
                    title: 'Anamnese respondida',
                    description: 'Formulário de anamnese preenchido',
                    timestamp: rec.created_at || rec.date,
                    metadata: ['Anamnese'],
                    linkPath: 'anamnesis'
                });
            });
        }

        // Cálculo energético (último por paciente)
        const { data: energyData } = energyResult;

        if (energyData) {
            energyData.forEach((calc) => {
                activities.push({
                    id: `energy-${calc.id}`,
                    type: 'energy',
                    title: 'Cálculo energético realizado',
                    description: calc.final_planned_kcal != null ? `${calc.final_planned_kcal} kcal planejadas` : 'Gastos energéticos calculados',
                    timestamp: calc.created_at,
                    metadata: ['Gastos energéticos'],
                    linkPath: 'energy-expenditure'
                });
            });
        }

        // Eventos de fotos de progresso (activity_log)
        if (photoEvents) {
            photoEvents.forEach((ev) => {
                const action = ev.event_name === 'progress_photo.added' ? 'adicionou' : ev.event_name === 'progress_photo.edited' ? 'editou' : 'removeu';
                const title = ev.event_name === 'progress_photo.added' ? 'Foto de progresso adicionada' : ev.event_name === 'progress_photo.edited' ? 'Foto de progresso editada' : 'Foto de progresso removida';
                activities.push({
                    id: `photo-event-${ev.id}`,
                    type: 'progress_photo',
                    title,
                    description: `Foto ${action}`,
                    timestamp: ev.occurred_at,
                    metadata: [ev.event_name === 'progress_photo.added' ? 'Nova foto' : ev.event_name === 'progress_photo.edited' ? 'Edição' : 'Remoção'],
                    linkPath: 'photos'
                });
            });
        }

        // Buscar conquistas (aumentado para cobrir mais tempo)
        const { data: achievementsData } = achievementsResult;

        if (achievementsData) {
            achievementsData.forEach((achievement) => {
                activities.push({
                    id: `achievement-${achievement.id}`,
                    type: 'achievement',
                    title: 'Conquista Desbloqueada',
                    description: achievement.achievements?.name || 'Nova conquista',
                    timestamp: achievement.achieved_at,
                    metadata: ['🏆 Conquista'],
                    linkPath: 'achievements'
                });
            });
        }

        // Buscar consultas recentes (aumentado para cobrir mais tempo)
        const { data: appointmentsData } = appointmentsResult;

        if (appointmentsData) {
            appointmentsData.forEach((appointment) => {
                activities.push({
                    id: `appointment-${appointment.id}`,
                    type: 'appointment',
                    title: 'Consulta Realizada',
                    description: appointment.notes || 'Consulta de acompanhamento',
                    timestamp: appointment.start_time,
                    metadata: [appointment.status || 'Concluída'],
                    linkPath: 'hub'
                });
            });
        }

        // Ordenar todas as atividades por data
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Retornar apenas o limite solicitado
        return { data: activities.slice(0, limit), error: null };
    } catch (error) {
        logSupabaseError("erro_ao_buscar_atividades_do_paciente", error);
        return { data: [], error };
    }
};

export const isLogActivityEventMissing = (err) => {
    if (!err) return false;
    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.code || err?.statusCode || '').toString();
    return code === '404' || code === '42883' || msg.includes('could not find the function') || msg.includes('schema cache');
};

export const logActivityEvent = async (eventInput) => {
    try {
        const normalized = buildActivityEventPayload(eventInput || {});

        const { data, error } = await supabase.rpc('log_activity_event', {
            p_event_name: normalized.event_name,
            p_event_version: normalized.event_version,
            p_source_module: normalized.source_module,
            p_patient_id: normalized.patient_id,
            p_nutritionist_id: normalized.nutritionist_id,
            p_payload: normalized.payload
        });

        if (error) {
            if (isLogActivityEventMissing(error)) {
                return { data: null, error: null };
            }
            logSupabaseError("erro_ao_registrar_evento_de_atividade", error);
            return { data: null, error };
        }
        return { data: data || null, error: null };
    } catch (error) {
        if (isLogActivityEventMissing(error)) {
            return { data: null, error: null };
        }
        logSupabaseError("erro_ao_registrar_evento_de_atividade", error);
        return { data: null, error };
    }
};

export const getActivityCtaRoute = (activity) => {
    if (!activity?.patient_id) return { label: 'Ver detalhes', route: '/nutritionist/patients' };
    const patientSegment = activity.patient_slug || activity.patient_id;
    switch (activity.type) {
        case 'meal': return { label: 'Ver diário', route: `/nutritionist/patients/${patientSegment}/food-diary` };
        case 'anthropometry': return { label: 'Ver avaliação', route: `/nutritionist/patients/${patientSegment}/anthropometry` };
        case 'anamnesis': return { label: 'Ver anamnese', route: `/nutritionist/patients/${patientSegment}/anamnese` };
        case 'meal_plan': return { label: 'Ver plano', route: `/nutritionist/patients/${patientSegment}/meal-plan` };
        case 'prescription': return { label: 'Ver cálculo', route: `/nutritionist/patients/${patientSegment}/energy-expenditure` };
        case 'energy_expenditure': return { label: 'Ver gastos energéticos', route: `/nutritionist/patients/${patientSegment}/energy-expenditure` };
        case 'progress_photo': return { label: 'Ver fotos de progresso', route: `/nutritionist/patients/${patientSegment}/photos` };
        case 'appointment': return { label: 'Ver agenda', route: '/nutritionist/agenda' };
        case 'message': return { label: 'Abrir chat', route: `/nutritionist/chat/${activity.patient_id}` };
        case 'achievement': return { label: 'Ver metas', route: `/nutritionist/patients/${patientSegment}/goals` };
        default: return { label: 'Ver paciente', route: `/nutritionist/patients/${patientSegment}/hub` };
    }
};
