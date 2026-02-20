import React, { useMemo, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
    getPatientsWithLowAdherence,
    getPatientsPendingData,
    getComprehensiveActivityFeed,
    getFeedPriorityRules,
    getNutritionistPatientsForFeed,
    getPatientsHighRiskLabAlerts,
    getFeedTaskStates,
    syncFeedTasksFromItems,
    resolveFeedTask,
    resolveFeedTasksBatch,
    snoozeFeedTask,
    snoozeFeedTasksBatch,
    getFeedTaskAuditTrail,
    attachFeedPriorityMeta
} from '@/lib/supabase/patient-queries';
import { supabase } from '@/lib/customSupabaseClient';
import { useNavigate } from 'react-router-dom';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/components/ui/use-toast';
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
    lab_high_risk: AlertTriangle,
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
    achievement: 'Conquista',
    lab_high_risk: 'Risco laboratorial'
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
    lab_high_risk: {
        card: 'bg-red-50/60 border-red-200/70',
        badge: 'bg-red-50 text-red-700 border-red-200',
        icon: 'text-red-600'
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
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [feedItems, setFeedItems] = useState([]);
    const [actionLoadingId, setActionLoadingId] = useState(null);
    const [feedFilter, setFeedFilter] = useState('all');
    const [selectedItemIds, setSelectedItemIds] = useState([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [expandedAuditItemId, setExpandedAuditItemId] = useState(null);
    const [auditLoadingItemId, setAuditLoadingItemId] = useState(null);
    const [auditTrailByKey, setAuditTrailByKey] = useState({});

    useEffect(() => {
        const fetchFeed = async () => {
            if (!user?.id) return;
            setLoading(true);

            try {
                const today = new Date();
                const [activitiesRes, lowAdherenceRes, pendingRes, appointmentsRes, patientsRes, priorityRulesRes, feedStateRes] = await Promise.all([
                    getComprehensiveActivityFeed(user.id, 40),
                    getPatientsWithLowAdherence(user.id),
                    getPatientsPendingData(user.id),
                    supabase
                        .from('appointments')
                        .select('id, start_time, patient_id, patient:appointments_patient_id_fkey(id, name, avatar_url)')
                        .eq('nutritionist_id', user.id)
                        .gte('start_time', today.toISOString())
                        .order('start_time', { ascending: true })
                        .limit(5),
                    getNutritionistPatientsForFeed(user.id),
                    getFeedPriorityRules(user.id),
                    getFeedTaskStates(user.id)
                ]);

                if (activitiesRes.error) throw activitiesRes.error;
                if (lowAdherenceRes.error) throw lowAdherenceRes.error;
                if (pendingRes.error) throw pendingRes.error;
                if (appointmentsRes.error) throw appointmentsRes.error;
                if (patientsRes.error) throw patientsRes.error;
                if (feedStateRes.error) throw feedStateRes.error;

                const patients = patientsRes.data || [];
                const patientIds = patients.map((patient) => patient.id).filter(Boolean);
                const patientNameMap = new Map(patients.map((patient) => [patient.id, patient.name || 'Paciente']));

                let labRiskAlerts = [];
                if (patientIds.length) {
                    const highRiskRes = await getPatientsHighRiskLabAlerts({
                        nutritionistId: user.id,
                        patientIds,
                        daysWindow: 120
                    });
                    if (highRiskRes.error) {
                        console.warn('Não foi possível carregar alertas laboratoriais de alto risco:', highRiskRes.error);
                    } else {
                        labRiskAlerts = highRiskRes.data || [];
                    }
                }

                const priorityRules = priorityRulesRes?.data || [];
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
                        priority: 5,
                        sourceType: 'activity',
                        sourceId: `activity-${activity.id}`
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
                        pendingType: item.type,
                        priority: 1,
                        sourceType: 'pending',
                        sourceId: `pending-${patient.patient_id}-${item.type}`
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
                    daysInactive: patient.days_inactive,
                    timestamp: null,
                    ctaLabel: 'Ver diário',
                    ctaRoute: `/nutritionist/patients/${patient.id}/food-diary`,
                    priority: 4,
                    sourceType: 'low_adherence',
                    sourceId: `low-adherence-${patient.id}`
                }));

                const appointmentItems = (appointmentsRes.data || []).map(appointment => ({
                    id: `appt-${appointment.id}`,
                    type: 'appointment_upcoming',
                    patientId: appointment.patient_id,
                    patientName: appointment.patient?.name || 'Paciente',
                    patientAvatar: appointment.patient?.avatar_url || null,
                    title: 'Consulta próxima',
                    description: appointment.start_time
                        ? format(parseISO(appointment.start_time), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })
                        : 'Consulta agendada',
                    timestamp: appointment.start_time,
                    ctaLabel: 'Ver agenda',
                    ctaRoute: '/nutritionist/agenda',
                    priority: 2,
                    sourceType: 'appointment_upcoming',
                    sourceId: `appt-${appointment.id}`
                }));

                const birthdayItems = getBirthdayItems(patientsRes.data || []).map((item) => ({
                    ...item,
                    sourceType: 'birthday',
                    sourceId: item.id
                }));

                const labRiskItems = (labRiskAlerts || []).map((alert) => ({
                    id: `lab-risk-${alert.patient_id}-${alert.marker_key}`,
                    type: 'lab_high_risk',
                    patientId: alert.patient_id,
                    patientName: patientNameMap.get(alert.patient_id) || 'Paciente',
                    title: 'Exame com risco alto',
                    description: `${alert.test_name || 'Marcador'}: ${alert.test_value ?? '--'} ${alert.test_unit || ''}`.trim(),
                    timestamp: alert.test_date || alert.created_at || null,
                    ctaLabel: 'Ver exames',
                    ctaRoute: `/nutritionist/patients/${alert.patient_id}/lab-results`,
                    priority: 1,
                    sourceType: 'lab_high_risk',
                    sourceId: `${alert.patient_id}-${alert.marker_key}`,
                    riskReason: alert.risk_reason
                }));

                const allItemsRaw = [
                    ...pendingItems,
                    ...appointmentItems,
                    ...birthdayItems,
                    ...lowAdherenceItems,
                    ...labRiskItems,
                    ...activityItems
                ];
                const allItems = attachFeedPriorityMeta(allItemsRaw, priorityRules);

                const syncRes = await syncFeedTasksFromItems(user.id, allItems, feedStateRes?.data || []);
                if (syncRes.error) {
                    console.warn('Não foi possível sincronizar snapshot do feed:', syncRes.error);
                }

                const mergedStateMap = new Map(
                    [
                        ...(feedStateRes?.data || []),
                        ...(syncRes?.data || [])
                    ].map((state) => [`${state.source_type}:${state.source_id}`, state])
                );

                const hydratedItems = allItems.map((item) => {
                    const key = `${item.sourceType}:${item.sourceId}`;
                    const state = mergedStateMap.get(key);
                    return {
                        ...item,
                        persistedStatus: state?.status || 'open',
                        firstSeenAt: state?.first_seen_at || state?.created_at || item.timestamp || null,
                        snoozeUntil: state?.snooze_until || null
                    };
                });

                const filteredItems = hydratedItems.filter((item) => {
                    const key = `${item.sourceType}:${item.sourceId}`;
                    const state = mergedStateMap.get(key);
                    if (!state) return true;
                    if (state.status === 'resolved') return false;
                    if (state.status === 'snoozed') {
                        if (!state.snooze_until) return false;
                        return new Date(state.snooze_until).getTime() <= Date.now();
                    }
                    return true;
                });

                const sorted = filteredItems.sort((a, b) => {
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

    const visibleFeedItems = useMemo(() => {
        if (feedFilter === 'high') {
            return feedItems.filter((item) => Number(item.priorityScore || 0) >= 4);
        }
        if (feedFilter === 'pending') {
            return feedItems.filter((item) => item.type === 'pending');
        }
        if (feedFilter === 'adherence') {
            return feedItems.filter((item) => item.type === 'low_adherence');
        }
        if (feedFilter === 'lab_risk') {
            return feedItems.filter((item) => item.type === 'lab_high_risk');
        }
        return feedItems;
    }, [feedItems, feedFilter]);

    useEffect(() => {
        setSelectedItemIds((prev) => prev.filter((id) => visibleFeedItems.some((item) => item.id === id)));
    }, [visibleFeedItems]);

    const filterChips = useMemo(() => {
        const total = feedItems.length;
        const high = feedItems.filter((item) => Number(item.priorityScore || 0) >= 4).length;
        const pending = feedItems.filter((item) => item.type === 'pending').length;
        const adherence = feedItems.filter((item) => item.type === 'low_adherence').length;
        const labRisk = feedItems.filter((item) => item.type === 'lab_high_risk').length;
        return [
            { id: 'all', label: 'Todos', count: total },
            { id: 'high', label: 'Alta prioridade', count: high },
            { id: 'pending', label: 'Pendências', count: pending },
            { id: 'adherence', label: 'Baixa adesão', count: adherence },
            { id: 'lab_risk', label: 'Risco exame', count: labRisk }
        ];
    }, [feedItems]);

    const buildTaskInputFromItem = (item) => ({
        nutritionistId: user?.id,
        patientId: item?.patientId || null,
        sourceType: item?.sourceType || item?.type || 'activity',
        sourceId: item?.sourceId || item?.id,
        title: item?.title || 'Item do feed',
        description: item?.description || null,
        priorityScore: Number(item?.priorityScore || 0),
        priorityReason: item?.priorityReason || null,
        metadata: {
            item_type: item?.type || null,
            cta_route: item?.ctaRoute || null
        }
    });

    const toggleItemSelection = (itemId) => {
        setSelectedItemIds((prev) => (
            prev.includes(itemId)
                ? prev.filter((id) => id !== itemId)
                : [...prev, itemId]
        ));
    };

    const selectedItems = useMemo(
        () => visibleFeedItems.filter((item) => selectedItemIds.includes(item.id)),
        [visibleFeedItems, selectedItemIds]
    );

    const handleResolveSelected = async () => {
        if (!selectedItems.length || !user?.id) return;
        setBulkActionLoading(true);
        try {
            const payload = selectedItems.map((item) => buildTaskInputFromItem(item));
            const result = await resolveFeedTasksBatch(payload);
            if (result.error && result.failedCount === payload.length) throw result.error;

            setFeedItems((prev) => prev.filter((item) => !selectedItemIds.includes(item.id)));
            setSelectedItemIds([]);
            toast({
                title: 'Ação em lote concluída',
                description: `${payload.length - (result.failedCount || 0)} itens resolvidos.`
            });
        } catch (error) {
            toast({
                title: 'Erro ao resolver em lote',
                description: 'Não foi possível concluir a ação em lote.',
                variant: 'destructive'
            });
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleSnoozeSelected = async (minutes = 120) => {
        if (!selectedItems.length || !user?.id) return;
        setBulkActionLoading(true);
        try {
            const payload = selectedItems.map((item) => buildTaskInputFromItem(item));
            const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
            const result = await snoozeFeedTasksBatch(payload, snoozeUntil);
            if (result.error && result.failedCount === payload.length) throw result.error;

            setFeedItems((prev) => prev.filter((item) => !selectedItemIds.includes(item.id)));
            setSelectedItemIds([]);
            toast({
                title: 'Ação em lote concluída',
                description: `${payload.length - (result.failedCount || 0)} itens adiados por ${minutes} minutos.`
            });
        } catch (error) {
            toast({
                title: 'Erro ao adiar em lote',
                description: 'Não foi possível concluir a ação em lote.',
                variant: 'destructive'
            });
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleResolveInline = async (item) => {
        if (!user?.id) return;
        setActionLoadingId(item.id);
        try {
            const taskInput = buildTaskInputFromItem(item);
            const { error } = await resolveFeedTask(taskInput);
            if (error) throw error;
            setFeedItems((prev) => prev.filter((feedItem) => feedItem.id !== item.id));
            toast({
                title: 'Pendência resolvida',
                description: 'O item foi marcado como resolvido.'
            });
        } catch (error) {
            toast({
                title: 'Erro ao resolver item',
                description: 'Não foi possível atualizar o status agora.',
                variant: 'destructive'
            });
        } finally {
            setActionLoadingId(null);
        }
    };

    const handleSnoozeInline = async (item, minutes = 120) => {
        if (!user?.id) return;
        setActionLoadingId(item.id);
        try {
            const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
            const taskInput = buildTaskInputFromItem(item);
            const { error } = await snoozeFeedTask({
                ...taskInput,
                snoozeUntil
            });
            if (error) throw error;
            setFeedItems((prev) => prev.filter((feedItem) => feedItem.id !== item.id));
            toast({
                title: 'Item adiado',
                description: `O item voltará ao feed em aproximadamente ${minutes} minutos.`
            });
        } catch (error) {
            toast({
                title: 'Erro ao adiar item',
                description: 'Não foi possível adiar o item agora.',
                variant: 'destructive'
            });
        } finally {
            setActionLoadingId(null);
        }
    };

    const buildAuditKey = (item) => `${item?.sourceType || 'activity'}:${item?.sourceId || item?.id}`;

    const handleToggleAudit = async (item) => {
        if (!user?.id) return;
        const key = buildAuditKey(item);

        if (expandedAuditItemId === item.id) {
            setExpandedAuditItemId(null);
            return;
        }

        setExpandedAuditItemId(item.id);
        if (auditTrailByKey[key]) return;

        setAuditLoadingItemId(item.id);
        try {
            const { data, error } = await getFeedTaskAuditTrail({
                nutritionistId: user.id,
                sourceType: item.sourceType,
                sourceId: item.sourceId,
                limit: 6
            });
            if (error) throw error;
            setAuditTrailByKey((prev) => ({ ...prev, [key]: data || [] }));
        } catch (error) {
            toast({
                title: 'Erro ao carregar histórico',
                description: 'Não foi possível buscar a auditoria desse item.',
                variant: 'destructive'
            });
        } finally {
            setAuditLoadingItemId(null);
        }
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
                    {visibleFeedItems.length} eventos
                </Badge>
            </CardHeader>
            <CardContent>
                <div className="mb-3 flex flex-wrap gap-2">
                    {filterChips.map((chip) => (
                        <Button
                            key={chip.id}
                            size="sm"
                            variant={feedFilter === chip.id ? 'default' : 'outline'}
                            className="h-7 px-2 text-xs"
                            onClick={() => setFeedFilter(chip.id)}
                        >
                            {chip.label} ({chip.count})
                        </Button>
                    ))}
                </div>
                {selectedItems.length > 0 ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                        <span className="text-xs text-muted-foreground">
                            {selectedItems.length} selecionado(s)
                        </span>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={bulkActionLoading}
                            onClick={handleResolveSelected}
                        >
                            Resolver selecionados
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={bulkActionLoading}
                            onClick={() => handleSnoozeSelected(120)}
                        >
                            Adiar selecionados 2h
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            disabled={bulkActionLoading}
                            onClick={() => setSelectedItemIds([])}
                        >
                            Limpar seleção
                        </Button>
                    </div>
                ) : null}
                {visibleFeedItems.length === 0 ? (
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
                        {visibleFeedItems.map(item => {
                            const Icon = iconByType[item.type] || iconByType.default;
                            const tone = toneByType[item.type] || toneByType.default;
                            const slaMeta = getSlaMeta(item);
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
                                                {item.type === 'lab_high_risk' && item.riskReason ? (
                                                    <p className="text-[11px] text-muted-foreground mt-1">
                                                        {item.riskReason}
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
                                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                                            <Badge variant="outline" className={`text-xs ${tone.badge}`}>
                                                {labelByType[item.type] || 'Atividade'}
                                            </Badge>
                                            {slaMeta ? (
                                                <Badge variant="outline" className={`text-xs ${slaMeta.badgeClass}`}>
                                                    {slaMeta.label}
                                                </Badge>
                                            ) : null}
                                            <Button
                                                size="sm"
                                                variant={selectedItemIds.includes(item.id) ? 'default' : 'outline'}
                                                className="h-7 px-2 text-xs"
                                                disabled={bulkActionLoading}
                                                onClick={() => toggleItemSelection(item.id)}
                                            >
                                                {selectedItemIds.includes(item.id) ? 'Selecionado' : 'Selecionar'}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2 text-xs hover:border-primary/40"
                                                disabled={actionLoadingId === item.id || bulkActionLoading}
                                                onClick={() => handleResolveInline(item)}
                                            >
                                                Resolver
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2 text-xs hover:border-primary/40"
                                                disabled={actionLoadingId === item.id || bulkActionLoading}
                                                onClick={() => handleSnoozeInline(item)}
                                            >
                                                Adiar 2h
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2 text-xs hover:border-primary/40"
                                                disabled={auditLoadingItemId === item.id}
                                                onClick={() => handleToggleAudit(item)}
                                            >
                                                {expandedAuditItemId === item.id ? 'Ocultar histórico' : 'Histórico'}
                                            </Button>
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
                                        {expandedAuditItemId === item.id ? (
                                            <div className="mt-2 rounded-lg border border-border/70 bg-background/70 p-2">
                                                {auditLoadingItemId === item.id ? (
                                                    <p className="text-xs text-muted-foreground">Carregando histórico...</p>
                                                ) : (
                                                    (auditTrailByKey[buildAuditKey(item)] || []).length > 0 ? (
                                                        <div className="space-y-1.5">
                                                            {(auditTrailByKey[buildAuditKey(item)] || []).map((entry, idx) => (
                                                                <div key={`${entry?.at || 'entry'}-${idx}`} className="text-xs text-muted-foreground">
                                                                    <span className="font-medium text-foreground">{translateAuditAction(entry?.action)}</span>
                                                                    {' · '}
                                                                    {entry?.at ? renderTimestamp(entry.at) : 'agora'}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-muted-foreground">Sem histórico operacional registrado ainda.</p>
                                                    )
                                                )}
                                            </div>
                                        ) : null}
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

const getSlaMeta = (item) => {
    if (!item?.firstSeenAt) return null;
    if (!['pending', 'low_adherence'].includes(item.type)) return null;

    const ageMs = Date.now() - new Date(item.firstSeenAt).getTime();
    if (Number.isNaN(ageMs)) return null;
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours >= 48) {
        return {
            label: 'SLA crítico',
            badgeClass: 'bg-red-50 text-red-700 border-red-200'
        };
    }
    if (ageHours >= 24) {
        return {
            label: 'SLA atenção',
            badgeClass: 'bg-amber-50 text-amber-700 border-amber-200'
        };
    }
    return {
        label: 'Dentro do SLA',
        badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
};

const translateAuditAction = (action) => {
    const actionMap = {
        resolved: 'Resolvido',
        snoozed: 'Adiado',
        reopened: 'Reaberto',
        resolved_batch: 'Resolvido em lote',
        snoozed_batch: 'Adiado em lote'
    };
    return actionMap[action] || 'Atualizado';
};

export default NutritionistActivityFeed;
