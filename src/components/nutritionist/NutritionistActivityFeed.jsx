import React, { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { getPatientsWithLowAdherence, getPatientsPendingData, getComprehensiveActivityFeed } from '@/lib/supabase/patient-queries';
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
                const [activitiesRes, lowAdherenceRes, pendingRes, appointmentsRes, patientsRes] = await Promise.all([
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
                        .eq('is_active', true)
                ]);

                if (activitiesRes.error) throw activitiesRes.error;
                if (lowAdherenceRes.error) throw lowAdherenceRes.error;
                if (pendingRes.error) throw pendingRes.error;
                if (appointmentsRes.error) throw appointmentsRes.error;
                if (patientsRes.error) throw patientsRes.error;

                const activityItems = (activitiesRes.data || []).map((activity) => {
                    const cta = getCtaForActivity(activity);
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
                        priority: 5
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
                        priority: 1
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
                    priority: 4
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
                    priority: 2
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
            <Card className="bg-card shadow-card-dark rounded-xl">
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
        <Card className="bg-card shadow-card-dark rounded-xl">
            <CardHeader>
                <CardTitle className="font-clash text-lg font-semibold text-primary">
                    Feed de Atividades
                </CardTitle>
                <CardDescription className="text-muted-foreground">
                    Macroview do consultório: pendências, alertas e atividades recentes
                </CardDescription>
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
                    <div className="space-y-2">
                        {feedItems.map(item => {
                            const Icon = iconByType[item.type] || iconByType.default;
                            return (
                                <div
                                    key={item.id}
                                    className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors"
                                >
                                    <div className="mt-1 rounded-full border border-border bg-background p-2">
                                        <Icon className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-medium text-foreground">
                                                    {item.patientName ? (
                                                        <>
                                                            <span className="text-primary font-semibold">{item.patientName}</span>
                                                            {' '}
                                                        </>
                                                    ) : null}
                                                    {item.title}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {item.description}
                                                </p>
                                            </div>
                                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                {renderTimestamp(item.timestamp)}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs">
                                                {labelByType[item.type] || 'Atividade'}
                                            </Badge>
                                            {item.ctaRoute ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 px-2 text-xs"
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

export default NutritionistActivityFeed;
