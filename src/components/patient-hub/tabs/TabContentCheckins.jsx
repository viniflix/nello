import React from 'react';
import CheckinSchedulePanel from '@/components/nutritionist/CheckinSchedulePanel';
import { useCheckins } from '@/hooks/useCheckins';
import { HubPanel, HubMetric } from '@/components/patient-hub/HubPanel';
import { CardSkeleton } from '@/components/ui/card-skeleton';
import { Button } from '@/components/ui/button';

const scoreOf = value => value == null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100 ? null : Number(value);
const dateLabel = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('pt-BR') : 'Data não informada';

export default function TabContentCheckins({ patientId }) {
    const { useCheckinHistory } = useCheckins();
    const { data: history = [], isLoading, isError, refetch } = useCheckinHistory(patientId);
    const scores = history.map(session => scoreOf(session.adherence_percentage)).filter(score => score != null);
    const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;

    return <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <HubPanel title="Respostas dos check-ins" description="Formulários respondidos pelo paciente">
                {isLoading ? <div role="status" aria-label="Carregando check-ins"><CardSkeleton lines={4} /></div>
                    : isError ? <div className="flex flex-col items-start gap-3"><p className="text-sm">Não foi possível carregar as respostas.</p><Button size="sm" variant="outline" onClick={() => refetch()}>Recarregar respostas</Button></div>
                        : <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-2">
                                <HubMetric label="Pontuação média" value={average == null ? '—' : `${average}%`} detail={`${scores.length} respostas com pontuação`} />
                                <HubMetric label="Respondidos" value={history.length} detail="check-ins no histórico" />
                            </div>
                            {history.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum check-in respondido ainda.</p>
                                : <ul className="divide-y divide-slate-100">{history.map(session => {
                                    const score = scoreOf(session.adherence_percentage);
                                    return <li key={session.id} className="flex min-w-0 items-start justify-between gap-3 py-3">
                                        <div className="min-w-0"><p className="break-words text-[13px] font-semibold">{session.checkin_templates?.name || 'Check-in'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{dateLabel(session.completed_at)}</p></div>
                                        <span className="shrink-0 text-xs font-medium text-slate-600">{score == null ? 'Sem pontuação' : `${Math.round(score)}%`}</span>
                                    </li>;
                                })}</ul>}
                            <p className="text-xs leading-relaxed text-muted-foreground">A média considera apenas respostas pontuadas. Formulários sem nota não são tratados como baixa adesão.</p>
                        </div>}
            </HubPanel>
        </div>
        <div className="min-w-0"><CheckinSchedulePanel patientId={patientId} /></div>
    </div>;
}
