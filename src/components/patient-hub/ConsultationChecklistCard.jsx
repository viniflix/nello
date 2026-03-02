import React, { useState, useEffect, useCallback } from 'react';
import {
    ClipboardList, Plus, CheckCircle2, Circle, Loader2,
    ChevronDown, ChevronUp, RotateCcw, X, History
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
    generateConsultationChecklist,
    getLatestActiveChecklist,
    getPatientChecklists,
    updateChecklistItem,
    cancelChecklist,
    computeChecklistProgress,
    CHECKLIST_STATUS_LABELS,
    CHECKLIST_CATEGORY_LABELS
} from '@/lib/supabase/consultation-checklists-queries';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CATEGORY_COLORS = {
    planning:      'bg-purple-100 text-purple-700 border-purple-200',
    clinical:      'bg-sky-100 text-sky-700 border-sky-200',
    nutrition:     'bg-emerald-100 text-emerald-700 border-emerald-200',
    anthropometry: 'bg-orange-100 text-orange-700 border-orange-200',
    labs:          'bg-red-100 text-red-700 border-red-200',
    lifestyle:     'bg-teal-100 text-teal-700 border-teal-200',
};

const ConsultationChecklistCard = ({ patientId, appointmentId = null }) => {
    const { user } = useAuth();
    const { toast } = useToast();

    const [checklist, setChecklist] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [togglingItem, setTogglingItem] = useState(null);
    const [expanded, setExpanded] = useState(true);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadChecklist = useCallback(async () => {
        if (!user?.id || !patientId) return;
        setLoading(true);
        try {
            const { data } = await getLatestActiveChecklist({
                nutritionistId: user.id,
                patientId
            });
            setChecklist(data);
        } finally {
            setLoading(false);
        }
    }, [user?.id, patientId]);

    useEffect(() => { loadChecklist(); }, [loadChecklist]);

    const handleGenerate = async () => {
        if (!user?.id || !patientId) return;
        setGenerating(true);
        try {
            const { data, error } = await generateConsultationChecklist({
                nutritionistId: user.id,
                patientId,
                appointmentId: appointmentId || null
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.reason || 'Erro ao gerar checklist');

            // Re-fetch the created checklist
            await loadChecklist();
            toast({ title: data.reopened ? 'Checklist reaberto' : 'Checklist gerado com sucesso' });
        } catch (err) {
            toast({ title: 'Erro ao gerar checklist', description: err.message, variant: 'destructive' });
        } finally {
            setGenerating(false);
        }
    };

    const handleToggleItem = async (item) => {
        if (!checklist?.id || togglingItem) return;
        setTogglingItem(item.id);
        try {
            const { data, error } = await updateChecklistItem({
                checklistId: checklist.id,
                itemId:      item.id,
                done:        !item.done
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.reason || 'Erro ao atualizar item');

            // Update checklist locally (optimistic) then re-fetch
            setChecklist(prev => {
                if (!prev) return prev;
                const newItems = (prev.items || []).map(i =>
                    i.id === item.id ? { ...i, done: !i.done, done_at: !i.done ? new Date().toISOString() : null } : i
                );
                const completed = newItems.filter(i => i.done).length;
                return {
                    ...prev,
                    items: newItems,
                    completed_items: completed,
                    status: data.all_done ? 'completed'
                        : completed > 0 ? 'in_progress'
                        : 'pending',
                    completed_at: data.all_done ? new Date().toISOString() : null
                };
            });

            if (data.all_done) {
                toast({ title: 'Checklist concluído!', description: 'Todos os itens foram marcados.' });
            }
        } catch (err) {
            toast({ title: 'Erro ao atualizar item', description: err.message, variant: 'destructive' });
        } finally {
            setTogglingItem(null);
        }
    };

    const handleCancel = async () => {
        if (!checklist?.id) return;
        const { error } = await cancelChecklist({ checklistId: checklist.id, nutritionistId: user.id });
        if (error) {
            toast({ title: 'Erro ao cancelar checklist', variant: 'destructive' });
        } else {
            toast({ title: 'Checklist cancelado' });
            setChecklist(null);
        }
    };

    const loadHistory = async () => {
        if (!user?.id || !patientId) return;
        setHistoryLoading(true);
        try {
            const { data } = await getPatientChecklists({
                nutritionistId: user.id,
                patientId,
                limit: 10
            });
            setHistory(data || []);
        } finally {
            setHistoryLoading(false);
        }
        setHistoryOpen(true);
    };

    const { percent, done, total } = computeChecklistProgress(checklist);

    const statusColor = {
        pending:     'bg-amber-100 text-amber-700 border-amber-200',
        in_progress: 'bg-sky-100 text-sky-700 border-sky-200',
        completed:   'bg-emerald-100 text-emerald-700 border-emerald-200',
        cancelled:   'bg-gray-100 text-gray-500 border-gray-200',
    };

    return (
        <Card className="border-l-4 border-l-violet-500">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="w-5 h-5 text-violet-500" />
                        <CardTitle className="text-lg">Checklist Pré-Consulta</CardTitle>
                        {checklist && (
                            <Badge
                                variant="outline"
                                className={cn('text-xs', statusColor[checklist.status] || statusColor.pending)}
                            >
                                {CHECKLIST_STATUS_LABELS[checklist.status] || checklist.status}
                            </Badge>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        {checklist && (
                            <Button
                                variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setExpanded(e => !e)}
                                title={expanded ? 'Recolher' : 'Expandir'}
                            >
                                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        )}
                        <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={historyOpen ? () => setHistoryOpen(false) : loadHistory}
                            title="Histórico"
                        >
                            <History className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {checklist && total > 0 && (
                    <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{done} de {total} itens concluídos</span>
                            <span>{percent}%</span>
                        </div>
                        <Progress value={percent} className="h-1.5" />
                    </div>
                )}
            </CardHeader>

            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : !checklist ? (
                    <div className="text-center py-6 space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Nenhum checklist ativo para este paciente.
                        </p>
                        <Button
                            size="sm"
                            onClick={handleGenerate}
                            disabled={generating}
                            className="gap-2"
                        >
                            {generating
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Plus className="h-4 w-4" />}
                            Gerar checklist pré-consulta
                        </Button>
                    </div>
                ) : (
                    <>
                        {expanded && (
                            <div className="space-y-2 mb-4">
                                {(checklist.items || [])
                                    .sort((a, b) => (a.priority || 3) - (b.priority || 3))
                                    .map(item => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            disabled={
                                                checklist.status === 'completed' ||
                                                checklist.status === 'cancelled' ||
                                                togglingItem === item.id
                                            }
                                            onClick={() => handleToggleItem(item)}
                                            className={cn(
                                                'w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all',
                                                item.done
                                                    ? 'bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/20'
                                                    : 'bg-card hover:bg-muted/40 border-border',
                                                (checklist.status === 'completed' || checklist.status === 'cancelled')
                                                    ? 'cursor-default opacity-70'
                                                    : 'cursor-pointer'
                                            )}
                                        >
                                            <div className="mt-0.5 flex-shrink-0">
                                                {togglingItem === item.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                ) : item.done ? (
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                ) : (
                                                    <Circle className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={cn(
                                                    'text-sm',
                                                    item.done
                                                        ? 'line-through text-muted-foreground'
                                                        : 'text-foreground'
                                                )}>
                                                    {item.label}
                                                </p>
                                                {item.category && (
                                                    <Badge
                                                        variant="outline"
                                                        className={cn(
                                                            'mt-1 text-xs',
                                                            CATEGORY_COLORS[item.category] || ''
                                                        )}
                                                    >
                                                        {CHECKLIST_CATEGORY_LABELS[item.category] || item.category}
                                                    </Badge>
                                                )}
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        )}

                        {checklist.status !== 'completed' && checklist.status !== 'cancelled' && (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleGenerate}
                                    disabled={generating}
                                    className="gap-1"
                                >
                                    {generating
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <RotateCcw className="h-3 w-3" />}
                                    Novo
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCancel}
                                    className="gap-1 text-destructive hover:text-destructive"
                                >
                                    <X className="h-3 w-3" />
                                    Cancelar
                                </Button>
                            </div>
                        )}

                        {checklist.status === 'completed' && checklist.completed_at && (
                            <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1">
                                <CheckCircle2 className="h-3 w-3" />
                                Concluído em {format(new Date(checklist.completed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                        )}
                    </>
                )}

                {/* History panel */}
                {historyOpen && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            Histórico de checklists
                        </p>
                        {historyLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : history.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhum checklist registrado.</p>
                        ) : (
                            history.map(h => {
                                const prog = computeChecklistProgress(h);
                                return (
                                    <div
                                        key={h.id}
                                        className="flex items-center justify-between text-xs border rounded px-3 py-2"
                                    >
                                        <span className="text-muted-foreground">
                                            {format(new Date(h.created_at), 'dd/MM/yy HH:mm', { locale: ptBR })}
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className={cn('text-xs', statusColor[h.status] || '')}
                                        >
                                            {CHECKLIST_STATUS_LABELS[h.status]}
                                        </Badge>
                                        <span className="text-muted-foreground">
                                            {prog.done}/{prog.total} ({prog.percent}%)
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default ConsultationChecklistCard;
