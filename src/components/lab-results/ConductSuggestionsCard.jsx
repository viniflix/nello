import React, { useState, useEffect, useCallback } from 'react';
import { Stethoscope, Loader2, CheckCircle2, X, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import {
    evaluateLabGoalRules,
    createConductSuggestion,
    approveConductSuggestion,
    rejectConductSuggestion,
    getConductSuggestions
} from '@/lib/supabase/conduct-queries';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ConductSuggestionsCard = ({ patientId }) => {
    const { user } = useAuth();
    const { toast } = useToast();
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [evaluating, setEvaluating] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [expanded, setExpanded] = useState(true);

    const loadEvaluated = useCallback(async () => {
        if (!user?.id || !patientId) return;
        setEvaluating(true);
        try {
            const { data, error } = await evaluateLabGoalRules({
                nutritionistId: user.id,
                patientId
            });
            if (error) throw error;
            if (data?.ok && data?.suggestions?.length > 0) {
                const { data: existing } = await getConductSuggestions({
                    nutritionistId: user.id,
                    patientId,
                    limit: 50
                });
                const existingKeys = new Set((existing || []).map((s) => s.suggestion_key));
                for (const sug of data.suggestions) {
                    if (!existingKeys.has(sug.suggestion_key)) {
                        const { error: createErr } = await createConductSuggestion({
                            nutritionistId: user.id,
                            patientId,
                            suggestionKey: sug.suggestion_key,
                            title: sug.title,
                            rationale: sug.rationale,
                            suggestedConduct: sug.suggested_conduct,
                            labContext: sug.lab_context || [],
                            goalContext: sug.goal_context
                        });
                        if (!createErr) existingKeys.add(sug.suggestion_key);
                    }
                }
            }
            await loadSuggestions();
            if (data?.ok && data?.suggestions?.length > 0) {
                toast({ title: 'Conduta avaliada', description: `${data.suggestions.length} sugestão(ões) gerada(s).` });
            } else if (data?.ok && data?.lab_count === 0 && !data?.has_goal) {
                toast({ title: 'Sem dados', description: 'Nenhum exame alterado ou meta ativa para avaliar.' });
            }
        } catch (err) {
            toast({ title: 'Erro ao avaliar conduta', description: err.message, variant: 'destructive' });
        } finally {
            setEvaluating(false);
        }
    }, [user?.id, patientId, loadSuggestions, toast]);

    const loadSuggestions = useCallback(async () => {
        if (!user?.id || !patientId) return;
        setLoading(true);
        try {
            const { data } = await getConductSuggestions({
                nutritionistId: user.id,
                patientId,
                limit: 15
            });
            setSuggestions(data || []);
        } finally {
            setLoading(false);
        }
    }, [user?.id, patientId]);

    useEffect(() => { loadSuggestions(); }, [loadSuggestions]);

    const handleApprove = async (s) => {
        setActionLoading(`approve-${s.id}`);
        try {
            const { data, error } = await approveConductSuggestion({
                suggestionId: s.id,
                actorId: user?.id
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.reason || 'Erro');
            toast({ title: 'Conduta aprovada', variant: 'success' });
            loadSuggestions();
        } catch (err) {
            toast({ title: 'Erro ao aprovar', description: err.message, variant: 'destructive' });
        } finally {
            setActionLoading(null);
        }
    };

    const handleReject = async (s) => {
        setActionLoading(`reject-${s.id}`);
        try {
            const { data, error } = await rejectConductSuggestion({
                suggestionId: s.id,
                actorId: user?.id
            });
            if (error) throw error;
            if (!data?.ok) throw new Error(data?.reason || 'Erro');
            toast({ title: 'Conduta rejeitada' });
            loadSuggestions();
        } catch (err) {
            toast({ title: 'Erro ao rejeitar', description: err.message, variant: 'destructive' });
        } finally {
            setActionLoading(null);
        }
    };

    const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
    const statusColors = {
        pending: 'bg-amber-100 text-amber-800 border-amber-200',
        approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        rejected: 'bg-gray-100 text-gray-600 border-gray-200'
    };

    return (
        <Card className="border-l-4 border-l-teal-500">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-teal-500" />
                        Sugestões de Conduta
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={evaluating}
                            onClick={loadEvaluated}
                        >
                            {evaluating ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                'Avaliar exames + meta'
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setExpanded((e) => !e)}
                        >
                            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                ) : suggestions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3">
                        Nenhuma sugestão de conduta. Clique em &quot;Avaliar exames + meta&quot; para gerar.
                    </p>
                ) : (
                    expanded && (
                        <div className="space-y-3">
                            {suggestions.map((s) => (
                                <div
                                    key={s.id}
                                    className={cn(
                                        'rounded-lg border p-3',
                                        s.status === 'pending'
                                            ? 'border-amber-200 bg-amber-50/30'
                                            : 'border-border bg-muted/20'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <p className="text-sm font-medium">{s.title}</p>
                                        <Badge variant="outline" className={cn('text-xs flex-shrink-0', statusColors[s.status])}>
                                            {s.status === 'pending' ? 'Pendente' : s.status === 'approved' ? 'Aprovada' : 'Rejeitada'}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-1">{s.rationale}</p>
                                    {s.suggested_conduct && (
                                        <p className="text-xs text-foreground/80 mb-2 italic">
                                            → {s.suggested_conduct}
                                        </p>
                                    )}
                                    {s.status === 'approved' && s.approved_at && (
                                        <p className="text-xs text-emerald-600">
                                            Aprovada em {format(new Date(s.approved_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                                        </p>
                                    )}
                                    {s.status === 'rejected' && s.rejected_at && (
                                        <p className="text-xs text-muted-foreground">
                                            Rejeitada em {format(new Date(s.rejected_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                                        </p>
                                    )}
                                    {s.status === 'pending' && (
                                        <div className="flex gap-2 mt-2">
                                            <Button
                                                size="sm"
                                                className="h-7 text-xs gap-1"
                                                disabled={actionLoading !== null}
                                                onClick={() => handleApprove(s)}
                                            >
                                                {actionLoading === `approve-${s.id}` ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <CheckCircle2 className="h-3 w-3" />
                                                )}
                                                Aprovar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 text-xs gap-1"
                                                disabled={actionLoading !== null}
                                                onClick={() => handleReject(s)}
                                            >
                                                {actionLoading === `reject-${s.id}` ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <X className="h-3 w-3" />
                                                )}
                                                Rejeitar
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )
                )}
            </CardContent>
        </Card>
    );
};

export default ConductSuggestionsCard;
