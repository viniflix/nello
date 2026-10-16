import React from 'react';
import CheckinSchedulePanel from '@/components/nutritionist/CheckinSchedulePanel';
import { useCheckins } from '@/hooks/useCheckins';
import { HubPanel, HubMetric } from '@/components/patient-hub/HubPanel';
import { CardSkeleton } from '@/components/ui/card-skeleton';
import { Button } from '@/components/ui/button';
import { normalizeCheckinScore as scoreOf } from '@/domain/clinical/checkins';

const dateLabel = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('pt-BR') : 'Data não informada';

export default function TabContentCheckins({ patientId }) {
    const { useCheckinHistory } = useCheckins();
    const { data: history = [], isLoading, isError, refetch } = useCheckinHistory(patientId);
    const groups = [1,2].map(version=>{
        const scores=history.filter(session=>(session.score_version??1)===version).map(session=>scoreOf(session.adherence_percentage)).filter(score=>score!=null);
        return {version,count:scores.length,average:scores.length?Math.round(scores.reduce((sum,score)=>sum+score,0)/scores.length):null};
    }).filter(group=>group.count);

    return <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <HubPanel title="Respostas dos check-ins" description="Formulários respondidos pelo paciente">
                {isLoading ? <div role="status" aria-label="Carregando check-ins"><CardSkeleton lines={4} /></div>
                    : isError ? <div className="flex flex-col items-start gap-3"><p className="text-sm">Não foi possível carregar as respostas.</p><Button size="sm" variant="outline" onClick={() => refetch()}>Recarregar respostas</Button></div>
                        : <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-2">
                                {groups.length?groups.map(group=><HubMetric key={group.version} label={group.version===2?'Média dos critérios definidos':'Média — regra anterior'} value={`${group.average}%`} detail={`${group.count} respostas com pontuação`}/>):<HubMetric label="Pontuação média" value="Sem pontuação" detail="Nenhuma resposta pontuada"/>}
                                <HubMetric label="Respondidos" value={history.length} detail="check-ins no histórico" />
                            </div>
                            {history.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum check-in respondido ainda.</p>
                                : <ul className="divide-y divide-slate-100">{history.map(session => {
                                    const score = scoreOf(session.adherence_percentage);
                                    return <li key={session.id} className="flex min-w-0 items-start justify-between gap-3 py-3">
                                        <div className="min-w-0"><p className="break-words text-[13px] font-semibold">{session.checkin_templates?.name || 'Check-in'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{dateLabel(session.completed_at)}</p></div>
                                        <div className="shrink-0 text-right"><span className="text-xs font-medium text-slate-600">{score == null ? 'Sem pontuação' : `${Math.round(score)}%`}</span>{score!=null&&<p className="text-xs text-muted-foreground">{session.score_version===2?'Critérios definidos':'Regra anterior'}</p>}</div>
                                    </li>;
                                })}</ul>}
                            <p className="text-xs leading-relaxed text-muted-foreground">As médias separam versões e consideram apenas respostas pontuadas. Formulários sem nota não são tratados como baixa adesão. A pontuação descreve critérios configurados e não avalia eficácia clínica.</p>
                        </div>}
            </HubPanel>
        </div>
        <div className="min-w-0"><CheckinSchedulePanel patientId={patientId} /></div>
    </div>;
}
