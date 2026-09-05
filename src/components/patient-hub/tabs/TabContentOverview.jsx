import React from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
    Activity, AlertCircle, CalendarDays, CheckCircle2, ChevronRight,
    ClipboardCheck, Info, Stethoscope, Utensils,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const sectionClass = 'rounded-xl border border-[#d8d5d0] bg-white shadow-card';

const safeDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value) => {
    const date = safeDate(value);
    return date ? format(date, "dd MMM · HH:mm", { locale: ptBR }) : 'Não informado';
};

const planStatus = {
    active: { label: 'Vigente', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    review: { label: 'Em revisão', className: 'border-amber-200 bg-amber-50 text-amber-700' },
    draft: { label: 'Rascunho', className: 'border-sky-200 bg-sky-50 text-sky-700' },
    missing: { label: 'Não iniciado', className: 'border-slate-200 bg-slate-50 text-slate-600' },
    unknown: { label: 'Indisponível', className: 'border-slate-200 bg-slate-50 text-slate-600' },
};

function Section({ title, description, action, children, className = '' }) {
    return (
        <section className={`${sectionClass} ${className}`}>
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div>
                    <h2 className="font-heading text-lg font-semibold leading-tight tracking-[0.025em] text-[#263125]">{title}</h2>
                    {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

function RecommendationInfo({ insight, methodology }) {
    const reasons = insight?.reasons || [];
    return (
        <div className="group relative">
            <button type="button" aria-describedby="patient-hub-recommendation-details" className="flex h-8 w-8 items-center justify-center rounded-full text-[#9a531f] hover:bg-orange-100 focus:bg-orange-100 focus:outline-none">
                <Info className="h-4 w-4" />
                <span className="sr-only">Entenda esta recomendação</span>
            </button>
            <div id="patient-hub-recommendation-details" role="tooltip" className="invisible absolute left-0 top-10 z-30 w-[min(300px,calc(100vw-48px))] rounded-lg bg-slate-900 p-3 text-left text-xs leading-relaxed text-white opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 sm:left-auto sm:right-0">
                <p className="font-bold">Por que esta ação foi sugerida?</p>
                {reasons.length > 0 ? (
                    <ul className="mt-2 space-y-1.5 text-slate-200">
                        {reasons.map((reason) => <li key={reason}>• {reason}</li>)}
                    </ul>
                ) : <p className="mt-2 text-slate-200">Não há evidências adicionais disponíveis.</p>}
                <p className="mt-2 border-t border-white/15 pt-2 text-slate-400">{methodology} A decisão final é sempre do profissional.</p>
            </div>
        </div>
    );
}

const actionIconByType = {
    'edit-profile': AlertCircle,
    'meal-plan': Utensils,
    tab: Stethoscope,
};

function RecommendedAction({ insights, onAction }) {
    const insight = insights?.primary;
    if (!insight) return null;
    const Icon = actionIconByType[insight.action?.type] || Activity;
    const isSuccess = insight.tone === 'success';
    return (
        <section className={`rounded-xl border px-4 py-4 shadow-[0_8px_24px_-20px_rgba(70,77,60,0.7)] sm:px-5 ${isSuccess ? 'border-emerald-200/90 bg-emerald-50/60' : 'border-orange-200/90 bg-[#fffaf5]'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSuccess ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-[#b75d1b]'}`}><Icon className="h-4 w-4" /></div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-1">
                            <p className={`text-[11px] font-bold uppercase tracking-[0.09em] ${isSuccess ? 'text-emerald-700' : 'text-[#9a531f]'}`}>Próxima ação recomendada</p>
                            <RecommendationInfo insight={insight} methodology={insights.methodology} />
                        </div>
                        <p className="mt-0.5 text-base font-semibold leading-6 text-slate-900 sm:text-lg">{insight.title}</p>
                        <p className="mt-1 text-[13px] leading-5 text-slate-600 sm:text-sm">{insight.description}</p>
                    </div>
                </div>
                <Button onClick={() => onAction(insight.action)} className={`h-10 shrink-0 gap-2 text-white ${isSuccess ? 'bg-[#5f6f52] hover:bg-[#4e5c45]' : 'bg-[#c4661f] hover:bg-[#a95318]'}`}>
                    {insight.actionLabel}<ChevronRight className="h-4 w-4" />
                </Button>
            </div>
        </section>
    );
}

function PlanCard({ context, onAction }) {
    const plan = context?.displayedPlan;
    const status = planStatus[context?.planStatus] || planStatus.missing;
    if (context?.planStatus === 'unknown') {
        return <Section title="Plano alimentar" description="Os dados do plano não puderam ser carregados" action={<Badge variant="outline" className={planStatus.unknown.className}>Indisponível</Badge>} className="lg:col-span-2"><div className="p-4 sm:p-5"><Button variant="outline" size="sm" onClick={() => onAction({ type: 'refresh' })}>Recarregar plano</Button></div></Section>;
    }
    return (
        <Section
            title="Plano alimentar"
            description={plan ? (safeDate(plan.updated_at) ? `Atualizado ${formatDistanceToNow(safeDate(plan.updated_at), { locale: ptBR, addSuffix: true })}` : 'Plano disponível') : 'Ainda não há uma prescrição para este paciente'}
            action={<Badge variant="outline" className={status.className}>{status.label}</Badge>}
            className="lg:col-span-2"
        >
            {plan ? (
                <>
                    <div className="px-4 py-4 sm:px-5">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-semibold text-slate-800">{plan.name || 'Plano alimentar'}</p>
                                <p className="mt-1 text-xs text-slate-500">{context.mealCount ?? '—'} refeições · {context.foodCount ?? '—'} alimentos</p>
                            </div>
                            <div className="mt-3 grid grid-cols-4 gap-2 sm:mt-0 sm:min-w-[360px]">
                                {[
                                    [plan.daily_calories, 'kcal'], [plan.daily_protein, 'prot.'],
                                    [plan.daily_carbs, 'carb.'], [plan.daily_fat, 'gord.'],
                                ].map(([value, label]) => (
                                    <div key={label} className="rounded-lg bg-[#efeeec] px-2 py-2 text-center shadow-[inset_0_1px_3px_rgba(39,45,35,0.07)]">
                                        <p className="text-sm font-bold text-slate-800">{value == null ? '—' : Math.round(Number(value))}</p>
                                        <p className="text-[10px] text-slate-500">{label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
                        <Button size="sm" onClick={() => onAction({ type: 'meal-plan', mode: 'quick' })} className="w-full bg-[#5f6f52] text-white hover:bg-[#4e5c45] sm:w-auto">{context.planStatus === 'draft' ? 'Continuar plano' : 'Abrir plano'}</Button>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-start gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <p className="text-sm leading-5 text-slate-600">Crie a primeira prescrição e comece diretamente pela montagem das refeições.</p>
                    <Button size="sm" onClick={() => onAction({ type: 'meal-plan', mode: 'quick' })} className="bg-[#5f6f52] text-white hover:bg-[#4e5c45]">Iniciar plano</Button>
                </div>
            )}
        </Section>
    );
}

function AppointmentCard({ context, onAction }) {
    const appointment = context?.nextAppointment;
    const appointmentAt = appointment?.start_time || appointment?.appointment_time;
    return (
        <Section title="Próxima consulta" description={appointment ? 'Compromisso mais próximo na agenda' : 'Nenhum compromisso futuro encontrado'}>
            <div className="p-4 sm:p-5">
                {appointment ? (
                    <>
                        <p className="font-heading text-xl font-semibold tracking-wide text-slate-900">{formatDateTime(appointmentAt)}</p>
                        <p className="mt-1 text-xs text-slate-500">{appointment.appointment_type || 'Consulta'} · {appointment.duration || 60} min</p>
                        <Badge variant="outline" className="mt-3 border-sky-200 bg-sky-50 text-sky-700">{appointment.status || 'Agendada'}</Badge>
                    </>
                ) : <p className="text-sm leading-5 text-slate-600">Agende uma consulta sem precisar procurar novamente pelo paciente.</p>}
                <Button variant="outline" size="sm" onClick={() => onAction({ type: 'schedule' })} className="mt-4 w-full border-[#c9d2c3] text-[#526047]">{appointment ? 'Abrir agenda' : 'Agendar consulta'}</Button>
            </div>
        </Section>
    );
}

function Signals({ insights, adherence, context, onAction }) {
    const items = [];
    if (adherence) items.push({ icon: CheckCircle2, label: 'Adesão recente', value: adherence.totalMeals > 0 ? `${adherence.adherencePercentage}% em 7 dias` : 'Sem registros nos últimos 7 dias', action: { type: 'tab', tab: 'adherence' } });
    if (context?.latestCheckin) items.push({ icon: ClipboardCheck, label: 'Último check-in', value: context.latestCheckin.completed_at ? `Respondido em ${formatDateTime(context.latestCheckin.completed_at)}` : `Status: ${context.latestCheckin.status}`, action: { type: 'tab', tab: 'checkins' } });
    if (context?.lastAppointment) items.push({ icon: CalendarDays, label: 'Última consulta', value: formatDateTime(context.lastAppointment.start_time || context.lastAppointment.appointment_time), action: { type: 'tab', tab: 'clinical' } });
    if (items.length === 0 && insights?.signals?.length) {
        insights.signals.slice(0, 3).forEach((signal) => items.push({ icon: AlertCircle, label: signal.title, value: signal.description, action: signal.action }));
    }
    return (
        <Section title="Pontos para acompanhar" description="Resumo calculado a partir dos registros disponíveis">
            <div className="divide-y divide-slate-100">
                {items.length ? items.slice(0, 3).map(({ icon: Icon, label, value, action }) => (
                    <button key={`${label}-${value}`} type="button" onClick={() => onAction(action)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:px-5">
                        <Icon className="h-4 w-4 shrink-0 text-[#718065]" />
                        <span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-slate-800">{label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{value}</span></span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                    </button>
                )) : <p className="px-4 py-5 text-sm text-slate-500 sm:px-5">Ainda não há registros suficientes para montar este resumo.</p>}
            </div>
        </Section>
    );
}

const TabContentOverview = ({ operationalContext, adherence, insights, activities = [], onAction }) => (
    <div className="space-y-4">
        <RecommendedAction insights={insights} onAction={onAction} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <PlanCard context={operationalContext} onAction={onAction} />
            <AppointmentCard context={operationalContext} onAction={onAction} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Signals insights={insights} adherence={adherence} context={operationalContext} onAction={onAction} />
            <Section title="Atividade recente" description="Últimas movimentações registradas no prontuário" action={<Button variant="ghost" size="sm" onClick={() => onAction({ type: 'feed' })} className="text-[#526047]">Ver histórico</Button>}>
                <div className="divide-y divide-slate-100">
                    {activities.length ? activities.slice(0, 3).map((activity, index) => {
                        const title = activity.title || activity.description || activity.action || activity.type || 'Registro atualizado';
                        const at = activity.created_at || activity.date || activity.timestamp;
                        return <div key={activity.id || `${title}-${index}`} className="flex gap-3 px-4 py-3 sm:px-5"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-[#718065]" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{title}</p><p className="mt-0.5 text-xs text-slate-500">{at ? formatDateTime(at) : 'Data não informada'}</p></div></div>;
                    }) : <p className="px-4 py-5 text-sm text-slate-500 sm:px-5">Nenhuma atividade recente encontrada.</p>}
                </div>
            </Section>
        </div>
    </div>
);

export default TabContentOverview;
