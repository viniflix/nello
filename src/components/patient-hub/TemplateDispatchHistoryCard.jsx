import React, { useState, useEffect, useCallback } from 'react';
import { Send, Loader2, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { getTemplateDispatchHistory } from '@/lib/supabase/message-templates-queries';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const CONTEXT_LABELS = {
    general:              'Geral',
    low_adherence:        'Baixa Aderência',
    goal_achieved:        'Meta Atingida',
    appointment_reminder: 'Lembrete Consulta',
    no_show_followup:     'Follow-up No-show',
    lab_alert:            'Alerta Exame',
    meal_plan_updated:    'Plano Atualizado',
    post_consultation:    'Pós-Consulta',
};

const TRIGGER_LABELS = {
    manual_clinical_tab:   'Disparo manual',
    appointment_completed: 'Consulta concluída',
    low_adherence_auto:    'Baixa aderência (auto)',
};

const TemplateDispatchHistoryCard = ({ patientId }) => {
    const { user } = useAuth();
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    const load = useCallback(async () => {
        if (!user?.id || !patientId) return;
        setLoading(true);
        try {
            const { data } = await getTemplateDispatchHistory({
                nutritionistId: user.id,
                patientId,
                limit: 10
            });
            setHistory(data || []);
        } finally {
            setLoading(false);
        }
    }, [user?.id, patientId]);

    useEffect(() => { load(); }, [load]);

    if (!loading && history.length === 0) return null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Send className="h-4 w-4 text-blue-500" />
                        Mensagens Enviadas
                    </CardTitle>
                    {history.length > 0 && (
                        <Button
                            variant="ghost" size="icon" className="h-6 w-6"
                            onClick={() => setExpanded(e => !e)}
                        >
                            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex items-center justify-center py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            {(expanded ? history : history.slice(0, 3)).map(item => (
                                <div key={item.id} className="rounded border p-2 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-medium truncate">
                                            {item.message_templates?.name || 'Template'}
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                'text-xs flex-shrink-0',
                                                item.delivery_status === 'sent'
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-red-50 text-red-700 border-red-200'
                                            )}
                                        >
                                            {item.delivery_status === 'sent' ? 'Enviado' : 'Falhou'}
                                        </Badge>
                                    </div>
                                    {item.rendered_title && (
                                        <p className="text-xs text-muted-foreground font-medium">
                                            {item.rendered_title}
                                        </p>
                                    )}
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                        {item.rendered_body}
                                    </p>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground/60">
                                        <span>
                                            {item.trigger_event
                                                ? (TRIGGER_LABELS[item.trigger_event] || item.trigger_event)
                                                : 'Manual'}
                                        </span>
                                        <span>
                                            {format(new Date(item.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {history.length > 3 && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 h-7 text-xs w-full"
                                onClick={() => setExpanded(e => !e)}
                            >
                                {expanded ? 'Ver menos' : `Ver mais ${history.length - 3} mensagens`}
                            </Button>
                        )}
                    </>
                )}
            </CardContent>
        </Card>
    );
};

export default TemplateDispatchHistoryCard;
