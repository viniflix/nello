import React, { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getPatientsWithLowAdherence, getPatientsPendingData, getComprehensiveActivityFeed, getFeedPriorityRules } from '@/lib/supabase/patient-queries';
import { supabase } from '@/lib/customSupabaseClient';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    AlertTriangle,
    Calendar,
    Clipboard,
    FileText,
    Gift,
    Loader2,
    MessageSquare,
    Stethoscope,
    Utensils,
    Weight,
    BookOpen,
    Activity,
    ChevronRight
} from 'lucide-react';

const iconByType = {
    pending: Clipboard,
    low_adherence: Activity,
    birthday: Gift,
    appointment_upcoming: Calendar,
    meal: Utensils,
    anthropometry: Weight,
    anamnesis: FileText,
    meal_plan: BookOpen,
    prescription: Clipboard,
    appointment: Calendar,
    message: MessageSquare,
    achievement: Activity,
    default: Stethoscope
};

const labelByType = {
    pending: 'Pendência',
    low_adherence: 'Baixa adesão',
    birthday: 'Aniversário',
    appointment_upcoming: 'Consulta próxima',
    meal: 'Refeição',
    anthropometry: 'Avaliação',
    anamnesis: 'Anamnese',
    meal_plan: 'Plano alimentar',
    prescription: 'Cálculo',
    appointment: 'Consulta',
    message: 'Mensagem',
    achievement: 'Conquista'
};

const toneByType = {
    pending: {
        card: 'bg-amber-50/60 border-amber-200/60',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: 'text-amber-600'
    },
    low_adherence: {
        card: 'bg-rose-50/60 border-rose-200/60',
        badge: 'bg-rose-50 text-rose-700 border-rose-200',
        icon: 'text-rose-600'
    },
    birthday: {
        card: 'bg-violet-50/60 border-violet-200/60',
        badge: 'bg-violet-50 text-violet-700 border-violet-200',
        icon: 'text-violet-600'
    },
    appointment_upcoming: {
        card: 'bg-sky-50/60 border-sky-200/60',
        badge: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: 'text-sky-600'
    },
    meal: {
        card: 'bg-orange-50/60 border-orange-200/60',
        badge: 'bg-orange-50 text-orange-700 border-orange-200',
        icon: 'text-orange-600'
    },
    anthropometry: {
        card: 'bg-emerald-50/60 border-emerald-200/60',
        badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: 'text-emerald-600'
    },
    anamnesis: {
        card: 'bg-indigo-50/60 border-indigo-200/60',
        badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        icon: 'text-indigo-600'
    },
    meal_plan: {
        card: 'bg-cyan-50/60 border-cyan-200/60',
        badge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        icon: 'text-cyan-600'
    },
    prescription: {
        card: 'bg-yellow-50/60 border-yellow-200/60',
        badge: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        icon: 'text-yellow-600'
    },
    appointment: {
        card: 'bg-blue-50/60 border-blue-200/60',
        badge: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: 'text-blue-600'
    },
    message: {
        card: 'bg-slate-50/60 border-slate-200/60',
        badge: 'bg-slate-50 text-slate-700 border-slate-200',
        icon: 'text-slate-600'
    },
    achievement: {
        card: 'bg-amber-50/60 border-amber-200/60',
        badge: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: 'text-amber-600'
    },
    default: {
        card: 'bg-muted/40 border-border/70',
        badge: 'bg-muted text-muted-foreground border-border',
        icon: 'text-muted-foreground'
    }
};

const NutritionistActivityFeed = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [feedItems, setFeedItems] = useState([]);

    useEffect(() => {
        const fetchFeed = async () => {
            if (!user?.id) return;
            setLoading(true);

            try {
                const today = new Date();
                const [activitiesRes, lowAdherenceRes, pendingRes, appointmentsRes, patientsRes, priorityRulesRes] = await Promise.all([
                    getComprehensiveActivityFeed(user.id, 40),
                    getPatientsWithLowAdherence(user.id),
                    getPatientsPendingData(user.id),
                    supabase
                        .from('appointments')
                        .select('id, appointment_time, patient_id, patient:appointments_patient_id_fkey(id, name, avatar_url)')
                        .eq('nutritionist_id', user.id)
                        .gte('appointment_time', today.toISOString())
                        .order('appointment_time', { ascending: true })
                        .limit(5),
                    supabase
                        .from('user_profiles')
                        .select('id, name, birth_date, avatar_url')
                        .eq('nutritionist_id', user.id)
                        .eq('is_active', true),
                    getFeedPriorityRules(user.id)
                ]);

                if (activitiesRes.error) throw activitiesRes.error;
                if (lowAdherenceRes.error) throw lowAdherenceRes.error;
                if (pendingRes.error) throw pendingRes.error;
                if (appointmentsRes.error) throw appointmentsRes.error;
                if (patientsRes.error) throw patientsRes.error;

                const priorityRules = priorityRulesRes?.data || [];
                const activityItems = (activitiesRes.data || []).map((activity) => {
                    const cta = getCtaForActivity(activity);
                    const priorityMeta = getPriorityMeta('activity', activity, priorityRules);
                    return {
                        id: `activity-${activity.id}`,
                        type: activity.type,
                        patientId: activity.patient_id,
                        patientName: activity.patient_name,
                        patientAvatar: activity.patient_avatar || null,
                        title: activity.title,
                        description: activity.description,
                        timestamp: activity.timestamp,
                        ctaLabel: cta.label,
                        ctaRoute: cta.route,
                        priority: 5,
                        priorityScore: priorityMeta.score,
                        priorityReason: priorityMeta.reason
                    };
                });

                const pendingItems = (pendingRes.data || []).flatMap(patient =>
                    patient.pending_items.map(item => ({
                        id: `pending-${patient.patient_id}-${item.type}`,
                        type: 'pending',
                        patientId: patient.patient_id,
                        patientName: patient.patient_name,
                        title: item.label,
                        description: 'Cadastro pendente',
                        timestamp: null,
                        ctaLabel: 'Resolver',
                        ctaRoute: item.route,
                        priority: 1,
                        priorityScore: getPriorityMeta('pending', item, priorityRules).score,
                        priorityReason: getPriorityMeta('pending', item, priorityRules).reason
                    }))
                );

                const lowAdherenceItems = (lowAdherenceRes.data || []).map(patient => ({
                    id: `low-adherence-${patient.id}`,
                    type: 'low_adherence',
                    patientId: patient.id,
                    patientName: patient.name,
                    title: 'Baixa adesão',
                    description: patient.days_inactive === null
                        ? 'Sem registros de refeição'
                        : `Sem registros há ${patient.days_inactive} dia${patient.days_inactive !== 1 ? 's' : ''}`,
                    timestamp: null,
                    ctaLabel: 'Ver diário',
                    ctaRoute: `/nutritionist/patients/${patient.id}/food-diary`,
                    priority: 4,
                    priorityScore: getPriorityMeta('low_adherence', patient, priorityRules).score,
                    priorityReason: getPriorityMeta('low_adherence', patient, priorityRules).reason
                }));

                const appointmentItems = (appointmentsRes.data || []).map(appointment => ({
                    id: `appt-${appointment.id}`,
                    type: 'appointment_upcoming',
                    patientId: appointment.patient_id,
                    patientName: appointment.patient?.name || 'Paciente',
                    patientAvatar: appointment.patient?.avatar_url || null,
                    title: 'Consulta próxima',
                    description: appointment.appointment_time
                        ? format(parseISO(appointment.appointment_time), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })
                        : 'Consulta agendada',
                    timestamp: appointment.appointment_time,
                    ctaLabel: 'Ver agenda',
                    ctaRoute: '/nutritionist/agenda',
                    priority: 2,
                    priorityScore: getPriorityMeta('appointment_upcoming', appointment, priorityRules).score,
                    priorityReason: getPriorityMeta('appointment_upcoming', appointment, priorityRules).reason
                }));

                const birthdayItems = getBirthdayItems(patientsRes.data || []);

                const allItems = [
                    ...pendingItems,
                    ...appointmentItems,
                    ...birthdayItems,
                    ...lowAdherenceItems,
                    ...activityItems
                ];

                const sorted = allItems.sort((a, b) => {
                    const scoreA = Number(a.priorityScore || 0);
                    const scoreB = Number(b.priorityScore || 0);
                    if (scoreA !== scoreB) return scoreB - scoreA;
                    if (a.priority !== b.priority) return a.priority - b.priority;
                    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                    return bTime - aTime;
                });

                setFeedItems(sorted);
            } catch (error) {
                console.error('Erro ao carregar feed:', error);
                setFeedItems([]);
            } finally {
                setLoading(false);
            }
        };

        fetchFeed();
    }, [user]);

    const renderTimestamp = (timestamp) => {
        if (!timestamp) return 'Pendente';
        const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        if (!isValid(date)) return 'Pendente';
        return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    };

    if (loading) {
        return (
            <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
                <CardHeader>
                    <CardTitle className="font-clash text-lg font-semibold text-primary">
                        Feed de Atividades
                    </CardTitle>
                    <CardDescription className="text-muted-foreground">Carregando...</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-2 md:gap-4 pb-2">
                <div className="min-w-0">
                    <CardTitle className="font-clash text-base md:text-lg font-semibold text-primary break-words">
                        Feed de Atividades
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-xs md:text-sm">
                        Tudo o que precisa ver ao iniciar o dia
                    </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                    {feedItems.length} eventos
                </Badge>
            </CardHeader>
            <CardContent>
                {feedItems.length === 0 ? (
                    <div className="text-center py-12">
                        <AlertTriangle className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                        <p className="text-muted-foreground font-medium mb-1">
                            Tudo em dia!
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Não há alertas ou atividades relevantes no momento
                        </p>
                    </div>
                ) : (
                    <div className="relative">
                        <div className="max-h-[520px] overflow-y-auto pr-2 space-y-2">
                        {feedItems.map(item => {
                            const Icon = iconByType[item.type] || iconByType.default;
                            const tone = toneByType[item.type] || toneByType.default;
                            return (
                                <div
                                    key={item.id}
                                    className={`flex items-start gap-2 md:gap-3 rounded-xl border p-3 md:p-4 shadow-sm hover:shadow-md transition-all min-w-0 ${tone.card}`}
                                >
                                    <div className="mt-0.5 flex items-center gap-2 md:gap-3 shrink-0">
                                        <div className="h-9 w-9 md:h-10 md:w-10 rounded-full border border-border bg-muted/40 flex items-center justify-center text-xs font-semibold text-muted-foreground">
                                            {item.patientName ? item.patientName.substring(0, 2).toUpperCase() : 'HT'}
                                        </div>
                                        <div className="rounded-full border border-border bg-background p-1.5 md:p-2">
                                            <Icon className={`h-3.5 w-3.5 md:h-4 md:w-4 ${tone.icon}`} />
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-foreground truncate">
                                                    {item.patientName ? (
                                                        <>
                                                            <span className="text-primary font-semibold">{item.patientName}</span>
                                                            {' '}
                                                        </>
                                                    ) : null}
                                                    {item.title}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                    {item.description}
                                                </p>
                                                {item.priorityReason ? (
                                                    <p className="text-[11px] text-muted-foreground mt-1">
                                                        Prioridade: {item.priorityReason}
                                                    </p>
                                                ) : null}
                                            </div>
                                            {item.type === 'pending' && item.ctaRoute ? (
                                                <Button
                                                    size="sm"
                                                    className="h-7 px-2 text-xs"
                                                    onClick={() => navigate(item.ctaRoute)}
                                                >
                                                    {item.ctaLabel || 'Resolver'}
                                                    <ChevronRight className="ml-1 h-3 w-3" />
                                                </Button>
                                            ) : (
                                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                    {renderTimestamp(item.timestamp)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <Badge variant="outline" className={`text-xs ${tone.badge}`}>
                                                {labelByType[item.type] || 'Atividade'}
                                            </Badge>
                                            {item.type !== 'pending' && item.ctaRoute ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2 text-xs hover:border-primary/40"
                                                    onClick={() => navigate(item.ctaRoute)}
                                                >
                                                    {item.ctaLabel || 'Ver detalhes'}
                                                    <ChevronRight className="ml-1 h-3 w-3" />
                                                </Button>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background to-transparent" />
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const getCtaForActivity = (activity) => {
    if (!activity?.patient_id) {
        return { label: 'Ver detalhes', route: '/nutritionist/patients' };
    }

    switch (activity.type) {
        case 'meal':
            return { label: 'Ver diário', route: `/nutritionist/patients/${activity.patient_id}/food-diary` };
        case 'anthropometry':
            return { label: 'Ver avaliação', route: `/nutritionist/patients/${activity.patient_id}/anthropometry` };
        case 'anamnesis':
            return { label: 'Ver anamnese', route: `/nutritionist/patients/${activity.patient_id}/anamnesis` };
        case 'meal_plan':
            return { label: 'Ver plano', route: `/nutritionist/patients/${activity.patient_id}/meal-plan` };
        case 'prescription':
            return { label: 'Ver cálculo', route: `/nutritionist/patients/${activity.patient_id}/energy-expenditure` };
        case 'appointment':
            return { label: 'Ver agenda', route: '/nutritionist/agenda' };
        case 'message':
            return { label: 'Abrir chat', route: `/chat/nutritionist/${activity.patient_id}` };
        case 'achievement':
            return { label: 'Ver metas', route: `/nutritionist/patients/${activity.patient_id}/goals` };
        default:
            return { label: 'Ver paciente', route: `/nutritionist/patients/${activity.patient_id}/hub` };
    }
};

const getBirthdayItems = (patients) => {
    const today = new Date();
    const items = [];

    patients.forEach(patient => {
        if (!patient.birth_date) return;
        const birthDate = new Date(patient.birth_date);
        birthDate.setFullYear(today.getFullYear());
        const diffDays = Math.ceil((birthDate - today) / (1000 * 60 * 60 * 24));

        if (diffDays === 0 || (diffDays > 0 && diffDays <= 7)) {
            items.push({
                id: `birthday-${patient.id}`,
                type: 'birthday',
                patientId: patient.id,
                patientName: patient.name,
                patientAvatar: patient.avatar_url || null,
                title: diffDays === 0 ? 'Aniversário hoje' : `Aniversário em ${diffDays} dia${diffDays > 1 ? 's' : ''}`,
                description: `Nascimento: ${format(new Date(patient.birth_date), 'dd/MM')}`,
                timestamp: null,
                ctaLabel: 'Ver perfil',
                ctaRoute: `/nutritionist/patients/${patient.id}/hub`,
                priority: 3
            });
        }
    });

    return items;
};

const getPriorityMeta = (kind, item, rules = []) => {
    const getRule = (ruleKey) => rules.find((rule) => rule.rule_key === ruleKey && rule.is_active !== false);

    if (kind === 'pending') {
        const rule = getRule('pending_data');
        return { score: Number(rule?.weight || 5), reason: 'Pendencia de dados essenciais' };
    }

    if (kind === 'low_adherence') {
        const rule = getRule('low_adherence');
        return { score: Number(rule?.weight || 4), reason: 'Baixa adesao recente' };
    }

    if (kind === 'appointment_upcoming') {
        const rule = getRule('appointment_upcoming');
        return { score: Number(rule?.weight || 3), reason: 'Consulta proxima' };
    }

    const typeToRule = {
        meal: 'recent_activity',
        anthropometry: 'recent_activity',
        anamnesis: 'recent_activity',
        meal_plan: 'recent_activity',
        appointment: 'appointment_upcoming',
        message: 'recent_activity',
        achievement: 'recent_activity'
    };
    const rule = getRule(typeToRule[item?.type] || 'recent_activity');
    return { score: Number(rule?.weight || 1), reason: 'Atividade recente' };
};

export default NutritionistActivityFeed;
