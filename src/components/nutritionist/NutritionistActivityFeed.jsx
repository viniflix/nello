import React, { useMemo, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
    Filter,
    Gift,
    Loader2,
    MessageSquare,
    RefreshCw,
    Stethoscope,
    Utensils,
    Weight,
    BookOpen,
    Activity,
    ChevronRight,
    MoreVertical,
    CheckCircle2,
    Circle
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
    pending: 'Pendente',
    low_adherence: 'Baixa adesão',
    birthday: 'Aniversário',
    appointment_upcoming: 'Consulta',
    meal: 'Refeição',
    anthropometry: 'Avaliação',
    anamnesis: 'Anamnese',
    meal_plan: 'Plano',
    prescription: 'Cálculo',
    appointment: 'Consulta',
    message: 'Mensagem',
    achievement: 'Conquista',
    lab_high_risk: 'Risco lab'
};

/** Reduz nome completo para "Nome Sobrenome" */
const toShortName = (name) => {
    if (!name || typeof name !== 'string') return 'Paciente';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 2) return name.trim();
    return `${parts[0]} ${parts[parts.length - 1]}`;
};

/** Título exibido sem duplicar a tag (ex: remove "Pendente" do título quando tag é "Pendente") */
const getDisplayTitle = (item) => {
    if (item.type === 'pending') {
        return (item.title || '').replace(/\s*pendente\s*$/i, '').trim() || item.title;
    }
    if (item.type === 'low_adherence') {
        return item.description || 'Sem registros no diário';
    }
    return item.title || 'Atividade';
};

/** Label de prioridade para exibição */
const getPriorityLabel = (score) => {
    const n = Number(score || 0);
    if (n >= 5) return { label: 'Alta', color: 'text-red-600' };
    if (n >= 4) return { label: 'Alta', color: 'text-amber-600' };
    if (n >= 2) return { label: 'Média', color: 'text-sky-600' };
    return { label: 'Normal', color: 'text-muted-foreground' };
};

const toneByType = {
    pending: { border: 'border-l-amber-500', bg: 'bg-white', tag: 'bg-amber-100 text-amber-800' },
    low_adherence: { border: 'border-l-rose-500', bg: 'bg-white', tag: 'bg-rose-100 text-rose-800' },
    birthday: { border: 'border-l-violet-500', bg: 'bg-white', tag: 'bg-violet-100 text-violet-800' },
    appointment_upcoming: { border: 'border-l-sky-500', bg: 'bg-white', tag: 'bg-sky-100 text-sky-800' },
    meal: { border: 'border-l-orange-500', bg: 'bg-white', tag: 'bg-orange-100 text-orange-800' },
    anthropometry: { border: 'border-l-emerald-500', bg: 'bg-white', tag: 'bg-emerald-100 text-emerald-800' },
    anamnesis: { border: 'border-l-indigo-500', bg: 'bg-white', tag: 'bg-indigo-100 text-indigo-800' },
    meal_plan: { border: 'border-l-cyan-500', bg: 'bg-white', tag: 'bg-cyan-100 text-cyan-800' },
    prescription: { border: 'border-l-yellow-500', bg: 'bg-white', tag: 'bg-yellow-100 text-yellow-800' },
    appointment: { border: 'border-l-blue-500', bg: 'bg-white', tag: 'bg-blue-100 text-blue-800' },
    message: { border: 'border-l-slate-500', bg: 'bg-white', tag: 'bg-slate-100 text-slate-800' },
    achievement: { border: 'border-l-amber-500', bg: 'bg-white', tag: 'bg-amber-100 text-amber-800' },
    lab_high_risk: { border: 'border-l-red-500', bg: 'bg-white', tag: 'bg-red-100 text-red-800' },
    default: { border: 'border-l-muted-foreground/40', bg: 'bg-white', tag: 'bg-muted/60 text-muted-foreground' }
};

const NutritionistActivityFeed = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [feedItems, setFeedItems] = useState([]);
    const [actionLoadingId, setActionLoadingId] = useState(null);
    const [feedFilter, setFeedFilter] = useState('all');
    const [selectMode, setSelectMode] = useState(false);
    const [selectedItemIds, setSelectedItemIds] = useState([]);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [expandedAuditItemId, setExpandedAuditItemId] = useState(null);
    const [auditLoadingItemId, setAuditLoadingItemId] = useState(null);
    const [auditTrailByKey, setAuditTrailByKey] = useState({});
    const [refreshing, setRefreshing] = useState(false);

    const fetchFeed = useCallback(async () => {
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
                if (appointmentsRes.error) console.warn('[Feed] Erro consultas:', appointmentsRes.error);
                if (patientsRes.error) throw patientsRes.error;
                if (priorityRulesRes?.error) console.warn('[Feed] Erro regras:', priorityRulesRes.error);
                if (feedStateRes?.error) console.warn('[Feed] Erro estados:', feedStateRes.error);

                const patients = patientsRes.data || [];
                const patientIds = patients.map((p) => p.id).filter(Boolean);
                const patientNameMap = new Map(patients.map((p) => [p.id, p.name || 'Paciente']));
                const patientAvatarMap = new Map(patients.map((p) => [p.id, p.avatar_url]).filter(([, v]) => v));

                let labRiskAlerts = [];
                if (patientIds.length) {
                    const highRiskRes = await getPatientsHighRiskLabAlerts({
                        nutritionistId: user.id,
                        patientIds,
                        daysWindow: 120
                    });
                    if (!highRiskRes.error) labRiskAlerts = highRiskRes.data || [];
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
                        patientAvatar: patientAvatarMap.get(patient.patient_id) || null,
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
                    patientAvatar: patientAvatarMap.get(patient.id) || null,
                    title: 'Baixa adesão',
                    description: patient.days_inactive === null ? 'Sem registros de refeição' : `Sem registros há ${patient.days_inactive} dia${patient.days_inactive !== 1 ? 's' : ''}`,
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
                    description: appointment.start_time ? format(parseISO(appointment.start_time), "d 'de' MMMM 'às' HH:mm", { locale: ptBR }) : 'Consulta agendada',
                    timestamp: appointment.start_time,
                    ctaLabel: 'Ver agenda',
                    ctaRoute: '/nutritionist/agenda',
                    priority: 2,
                    sourceType: 'appointment_upcoming',
                    sourceId: `appt-${appointment.id}`
                }));

                const birthdayItems = getBirthdayItems(patientsRes.data || []).map((item) => ({ ...item, sourceType: 'birthday', sourceId: item.id }));

                const labRiskItems = (labRiskAlerts || []).map((alert) => ({
                    id: `lab-risk-${alert.patient_id}-${alert.marker_key}`,
                    type: 'lab_high_risk',
                    patientId: alert.patient_id,
                    patientName: patientNameMap.get(alert.patient_id) || 'Paciente',
                    patientAvatar: patientAvatarMap.get(alert.patient_id) || null,
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

                const allItemsRaw = [...pendingItems, ...appointmentItems, ...birthdayItems, ...lowAdherenceItems, ...labRiskItems, ...activityItems];
                const allItems = attachFeedPriorityMeta(allItemsRaw, priorityRules);

                const syncRes = await syncFeedTasksFromItems(user.id, allItems, feedStateRes?.data || []);
                if (syncRes.error) console.warn('[Feed] Erro sync:', syncRes.error);

                const mergedStateMap = new Map(
                    [...(feedStateRes?.data || []), ...(syncRes?.data || [])].map((s) => [`${s.source_type}:${s.source_id}`, s])
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
                setRefreshing(false);
            }
    }, [user]);

    useEffect(() => {
        if (user?.id) fetchFeed();
    }, [user?.id, fetchFeed]);

    const handleRefresh = () => {
        setRefreshing(true);
        fetchFeed();
    };

    const renderTimestamp = (timestamp) => {
        if (!timestamp) return null;
        const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
        if (!isValid(date)) return null;
        return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    };

    const visibleFeedItems = useMemo(() => {
        if (feedFilter === 'high') return feedItems.filter((i) => Number(i.priorityScore || 0) >= 4);
        if (feedFilter === 'pending') return feedItems.filter((i) => i.type === 'pending');
        if (feedFilter === 'adherence') return feedItems.filter((i) => i.type === 'low_adherence');
        if (feedFilter === 'lab_risk') return feedItems.filter((i) => i.type === 'lab_high_risk');
        return feedItems;
    }, [feedItems, feedFilter]);

    const backlogStats = useMemo(() => {
        const now = Date.now();
        const openCount = feedItems.length;
        const withAge = feedItems.map((row) => {
            const base = row.firstSeenAt || row.timestamp;
            const ageHours = base ? (now - new Date(base).getTime()) / (1000 * 60 * 60) : 0;
            return Number.isFinite(ageHours) ? ageHours : 0;
        });
        const criticalCount = withAge.filter((h) => h >= 48).length;
        const attentionCount = withAge.filter((h) => h >= 24 && h < 48).length;
        const highRiskLabCount = feedItems.filter((i) => i.type === 'lab_high_risk').length;
        return { openCount, criticalCount, attentionCount, highRiskLabCount };
    }, [feedItems]);

    useEffect(() => {
        setSelectedItemIds((prev) => prev.filter((id) => visibleFeedItems.some((i) => i.id === id)));
    }, [visibleFeedItems]);

    const filterChips = useMemo(() => {
        const total = feedItems.length;
        const high = feedItems.filter((i) => Number(i.priorityScore || 0) >= 4).length;
        const pending = feedItems.filter((i) => i.type === 'pending').length;
        const adherence = feedItems.filter((i) => i.type === 'low_adherence').length;
        const labRisk = feedItems.filter((i) => i.type === 'lab_high_risk').length;
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
        metadata: { item_type: item?.type || null, cta_route: item?.ctaRoute || null }
    });

    const toggleItemSelection = (itemId) => {
        setSelectedItemIds((prev) =>
            prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
        );
    };

    const selectedItems = useMemo(
        () => visibleFeedItems.filter((i) => selectedItemIds.includes(i.id)),
        [visibleFeedItems, selectedItemIds]
    );

    const handleResolveSelected = async () => {
        if (!selectedItems.length || !user?.id) return;
        setBulkActionLoading(true);
        try {
            const payload = selectedItems.map((i) => buildTaskInputFromItem(i));
            const result = await resolveFeedTasksBatch(payload);
            if (result.error && result.failedCount === payload.length) throw result.error;
            setFeedItems((prev) => prev.filter((i) => !selectedItemIds.includes(i.id)));
            setSelectedItemIds([]);
            setSelectMode(false);
            toast({ title: 'Marcado como resolvido', description: `${payload.length - (result.failedCount || 0)} itens resolvidos.` });
        } catch (error) {
            toast({ title: 'Erro ao marcar como resolvido', description: 'Tente novamente.', variant: 'destructive' });
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleResolveInline = async (item) => {
        if (!user?.id) return;
        setActionLoadingId(item.id);
        try {
            const { error } = await resolveFeedTask(buildTaskInputFromItem(item));
            if (error) throw error;
            setFeedItems((prev) => prev.filter((i) => i.id !== item.id));
            toast({ title: 'Marcado como resolvido', description: 'O item saiu do feed.' });
        } catch (error) {
            toast({ title: 'Erro', description: 'Não foi possível marcar como resolvido.', variant: 'destructive' });
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
            toast({ title: 'Erro ao carregar histórico', description: 'Tente novamente.', variant: 'destructive' });
        } finally {
            setAuditLoadingItemId(null);
        }
    };

    const getSlaMeta = (item) => {
        if (!item?.firstSeenAt || !['pending', 'low_adherence'].includes(item.type)) return null;
        const ageHours = (Date.now() - new Date(item.firstSeenAt).getTime()) / (1000 * 60 * 60);
        if (Number.isNaN(ageHours)) return null;
        if (ageHours >= 48) return { label: 'Crítico', tag: 'bg-red-100 text-red-800' };
        if (ageHours >= 24) return { label: 'Atenção', tag: 'bg-amber-100 text-amber-800' };
        return null;
    };

    const translateAuditAction = (action) => {
        const map = { resolved: 'Resolvido', snoozed: 'Adiado', reopened: 'Reaberto', resolved_batch: 'Resolvido em lote', snoozed_batch: 'Adiado em lote' };
        return map[action] || 'Atualizado';
    };

    if (loading) {
        return (
            <Card className="bg-card shadow-card-dark rounded-xl overflow-hidden">
                <CardHeader>
                    <CardTitle className="font-clash text-lg font-semibold text-primary">Feed de Atividades</CardTitle>
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
            <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                        <CardTitle className="font-clash text-base md:text-lg font-semibold text-primary">Feed de Atividades</CardTitle>
                        <CardDescription className="text-muted-foreground text-xs md:text-sm">Tudo que precisa ver ao iniciar o dia</CardDescription>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant={selectMode ? 'secondary' : 'outline'}
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelectedItemIds([]); }}
                        >
                            {selectMode ? 'Cancelar seleção' : 'Selecionar itens'}
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                                    <Filter className="h-3.5 w-3.5" />
                                    Filtro
                                    {feedFilter !== 'all' && (
                                        <span className="ml-0.5 text-primary font-medium">
                                            ({filterChips.find((c) => c.id === feedFilter)?.label})
                                        </span>
                                    )}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {filterChips.map((chip) => (
                                    <DropdownMenuItem
                                        key={chip.id}
                                        onClick={() => setFeedFilter(chip.id)}
                                        className={feedFilter === chip.id ? 'bg-muted' : ''}
                                    >
                                        {chip.label} ({chip.count})
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                                >
                                    {visibleFeedItems.length} itens
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-3" align="end">
                                <div className="space-y-3">
                                    <p className="text-sm font-semibold">Backlog</p>
                                    <div className="space-y-1.5 text-xs">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Abertos</span>
                                            <span className="font-medium">{backlogStats.openCount}</span>
                                        </div>
                                        {backlogStats.criticalCount > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-red-600 flex items-center gap-1">
                                                    <AlertTriangle className="h-3 w-3" /> Crítico
                                                </span>
                                                <span className="font-medium">{backlogStats.criticalCount}</span>
                                            </div>
                                        )}
                                        {backlogStats.attentionCount > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-amber-600">Atenção</span>
                                                <span className="font-medium">{backlogStats.attentionCount}</span>
                                            </div>
                                        )}
                                        {backlogStats.highRiskLabCount > 0 && (
                                            <div className="flex justify-between">
                                                <span className="text-rose-600">Risco exame</span>
                                                <span className="font-medium">{backlogStats.highRiskLabCount}</span>
                                            </div>
                                        )}
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="w-full h-7 text-xs"
                                        onClick={handleRefresh}
                                        disabled={refreshing}
                                    >
                                        {refreshing ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                        ) : (
                                            <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                        )}
                                        Atualizar feed
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {selectMode && selectedItems.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 mt-2">
                        <span className="text-xs font-medium">{selectedItems.length} selecionado(s)</span>
                        <Button size="sm" variant="default" className="h-7 text-xs" disabled={bulkActionLoading} onClick={handleResolveSelected}>
                            {bulkActionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                            Marcar como resolvido
                        </Button>
                    </div>
                )}
            </CardHeader>

            <CardContent>
                {visibleFeedItems.length === 0 ? (
                    <div className="text-center py-12">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500/60 mx-auto mb-3" />
                        <p className="text-muted-foreground font-medium mb-1">Tudo em dia!</p>
                        <p className="text-sm text-muted-foreground">Não há alertas ou pendências no momento</p>
                    </div>
                ) : (
                    <div className="max-h-[520px] overflow-y-auto pr-1 space-y-3">
                        {visibleFeedItems.map((item) => {
                            const Icon = iconByType[item.type] || iconByType.default;
                            const tone = toneByType[item.type] || toneByType.default;
                            const slaMeta = getSlaMeta(item);
                            const tagLabel = labelByType[item.type] || 'Atividade';
                            const displayTitle = getDisplayTitle(item);
                            const shortName = toShortName(item.patientName);
                            const priorityMeta = getPriorityLabel(item.priorityScore);
                            const timeAgo = item.firstSeenAt
                                ? (() => {
                                    const d = new Date(item.firstSeenAt);
                                    if (!isValid(d)) return null;
                                    return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
                                })()
                                : (item.timestamp && isValid(new Date(item.timestamp))
                                    ? formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: ptBR })
                                    : null);

                            return (
                                <article
                                    key={item.id}
                                    className={`relative rounded-xl border border-border/70 ${tone.border} ${tone.bg} shadow-sm hover:shadow transition-shadow overflow-hidden`}
                                >
                                    {/* Header: avatar + conteúdo + menu */}
                                    <div className="flex items-start gap-3 p-4 pb-0">
                                        {selectMode ? (
                                            <button
                                                type="button"
                                                className="mt-1 shrink-0 rounded-full p-0.5 hover:bg-muted/50 transition-colors"
                                                onClick={() => toggleItemSelection(item.id)}
                                            >
                                                {selectedItemIds.includes(item.id) ? (
                                                    <CheckCircle2 className="h-5 w-5 text-primary" />
                                                ) : (
                                                    <Circle className="h-5 w-5 text-muted-foreground/60" />
                                                )}
                                            </button>
                                        ) : (
                                            <Avatar className="h-9 w-9 shrink-0">
                                                {item.patientAvatar ? (
                                                    <AvatarImage src={item.patientAvatar} alt={shortName} />
                                                ) : null}
                                                <AvatarFallback className="bg-muted/60 text-xs font-semibold">
                                                    {shortName ? shortName.substring(0, 2).toUpperCase() : '?'}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}

                                        <div className="flex-1 min-w-0 pr-8">
                                            {/* Nome · ícone · título [tag] */}
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="font-semibold text-foreground">{shortName}</span>
                                                <span className="text-muted-foreground">·</span>
                                                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                <span className="text-foreground/90">{displayTitle}</span>
                                                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 font-medium ${tone.tag}`}>
                                                    {tagLabel}
                                                </Badge>
                                                {slaMeta && (
                                                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${slaMeta.tag}`}>
                                                        {slaMeta.label}
                                                    </Badge>
                                                )}
                                            </div>
                                            {item.type !== 'low_adherence' && item.description && (
                                                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                                            )}
                                            {item.type === 'lab_high_risk' && item.riskReason && (
                                                <p className="text-xs text-muted-foreground mt-1">{item.riskReason}</p>
                                            )}
                                            <div className="flex items-center gap-2 mt-2 text-[11px] text-muted-foreground">
                                                {timeAgo && <span>{timeAgo}</span>}
                                                <span className={priorityMeta.color}>· {priorityMeta.label}</span>
                                            </div>

                                            {expandedAuditItemId === item.id && (
                                                <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
                                                    {auditLoadingItemId === item.id ? (
                                                        <span className="text-muted-foreground">Carregando...</span>
                                                    ) : (auditTrailByKey[buildAuditKey(item)] || []).length > 0 ? (
                                                        <div className="space-y-1">
                                                            {(auditTrailByKey[buildAuditKey(item)] || []).map((entry, idx) => (
                                                                <div key={idx} className="text-muted-foreground">
                                                                    <span className="font-medium text-foreground">{translateAuditAction(entry?.action)}</span>
                                                                    {' · '}{entry?.at ? renderTimestamp(entry.at) : 'agora'}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground">Sem histórico.</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="sm" variant="ghost" className="absolute top-3 right-3 h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={() => handleResolveInline(item)}
                                                    disabled={actionLoadingId === item.id || bulkActionLoading}
                                                >
                                                    {actionLoadingId === item.id ? (
                                                        <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                                                    ) : (
                                                        <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                                                    )}
                                                    Marcar como resolvido
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleToggleAudit(item)}>
                                                    Histórico
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>

                                    {/* Barra de ações (estilo post: Like | Comment | Share) */}
                                    <div className="flex items-center gap-2 px-4 py-2 border-t border-border/40">
                                        {item.ctaRoute && (
                                            <button
                                                type="button"
                                                onClick={() => navigate(item.ctaRoute)}
                                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary hover:bg-primary/10 transition-colors -ml-1"
                                            >
                                                {item.ctaLabel || 'Resolver'}
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const getCtaForActivity = (activity) => {
    if (!activity?.patient_id) return { label: 'Ver detalhes', route: '/nutritionist/patients' };
    switch (activity.type) {
        case 'meal': return { label: 'Ver diário', route: `/nutritionist/patients/${activity.patient_id}/food-diary` };
        case 'anthropometry': return { label: 'Ver avaliação', route: `/nutritionist/patients/${activity.patient_id}/anthropometry` };
        case 'anamnesis': return { label: 'Ver anamnese', route: `/nutritionist/patients/${activity.patient_id}/anamnesis` };
        case 'meal_plan': return { label: 'Ver plano', route: `/nutritionist/patients/${activity.patient_id}/meal-plan` };
        case 'prescription': return { label: 'Ver cálculo', route: `/nutritionist/patients/${activity.patient_id}/energy-expenditure` };
        case 'appointment': return { label: 'Ver agenda', route: '/nutritionist/agenda' };
        case 'message': return { label: 'Abrir chat', route: `/chat/nutritionist/${activity.patient_id}` };
        case 'achievement': return { label: 'Ver metas', route: `/nutritionist/patients/${activity.patient_id}/goals` };
        default: return { label: 'Ver paciente', route: `/nutritionist/patients/${activity.patient_id}/hub` };
    }
};

const getBirthdayItems = (patients) => {
    const today = new Date();
    const items = [];
    patients.forEach((patient) => {
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
