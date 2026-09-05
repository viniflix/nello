import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format, subDays, parseISO, isValid } from 'date-fns';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CardSkeleton } from '@/components/ui/card-skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveMealPlan } from '@/lib/supabase/meal-plan-queries';
import { calculateDiaryAdherence, getNutritionalSummary } from '@/lib/supabase/food-diary-queries';
import EnergyExpenditureSummaryCard from '@/components/patient-hub/EnergyExpenditureSummaryCard';
import { HubPanel, HubMetric } from '@/components/patient-hub/HubPanel';
import { patientRoute } from '@/lib/utils/patientRoutes';

const number = value => value == null || !Number.isFinite(Number(value)) ? '—' : Math.round(Number(value)).toLocaleString('pt-BR');
const statusLabels = { active: 'Vigente', draft: 'Rascunho', review: 'Em revisão', unknown: 'Indisponível', missing: 'Sem plano' };

export default function TabContentNutrition({ patientId, patientData, operationalContext, onOpenChat, onRefresh }) {
    const patient = patientData || { id: patientId };
    const navigate = useNavigate();
    const { user } = useAuth();
    const openPlan = () => navigate(`${patientRoute(patient, 'meal-plan')}?quick=1`);
    const today = format(new Date(), 'yyyy-MM-dd');
    const planQuery = useQuery({
        queryKey: ['hub-nutrition-plan', user?.id, patientId],
        enabled: Boolean(user?.id && patientId && !operationalContext),
        staleTime: 60000,
        queryFn: async () => {
            const result = await getActiveMealPlan(patientId);
            if (result.error) throw result.error;
            return result.data;
        },
    });
    const diaryQuery = useQuery({
        queryKey: ['hub-nutrition-diary', user?.id, patientId, today],
        enabled: Boolean(user?.id && patientId),
        staleTime: 60000,
        queryFn: async () => {
            const start = format(subDays(parseISO(today), 6), 'yyyy-MM-dd');
            const [adherence, summary] = await Promise.all([
                calculateDiaryAdherence(patientId, 7), getNutritionalSummary(patientId, start, today),
            ]);
            return { adherence, summary };
        },
    });
    const plan = operationalContext ? operationalContext.displayedPlan : planQuery.data;
    const status = operationalContext?.planStatus || (planQuery.isError ? 'unknown' : plan?.is_draft ? 'draft' : plan ? (plan.prescription_status === 'finalized' ? 'active' : 'review') : 'missing');
    const loadingPlan = !operationalContext && planQuery.isLoading;
    const canShare = Boolean(onOpenChat && status === 'active' && plan?.is_active && !plan?.is_draft
        && plan?.prescription_status === 'finalized'
        && (!plan.start_date || plan.start_date <= today) && (!plan.end_date || plan.end_date >= today));
    const adherence = diaryQuery.data?.adherence;
    const summary = diaryQuery.data?.summary;
    const retryPlan = () => operationalContext ? onRefresh?.() : planQuery.refetch();
    const startDate = plan?.start_date ? parseISO(plan.start_date) : null;

    return <div className="flex flex-col gap-4">
        <HubPanel title="Plano alimentar" description="Prescrição e composição diária" action={status !== 'unknown' && !loadingPlan ? <Button size="sm" onClick={openPlan}>{plan ? (status === 'draft' ? 'Continuar plano' : 'Ajustar plano') : 'Iniciar plano'}</Button> : null}>
            {loadingPlan ? <div role="status" aria-label="Carregando plano alimentar"><CardSkeleton lines={3} /></div>
                : status === 'unknown' ? <div className="flex flex-col items-start gap-3"><p className="text-sm">Não foi possível carregar o plano alimentar.</p><Button variant="outline" size="sm" onClick={retryPlan}>Recarregar plano</Button></div>
                    : !plan ? <p className="text-sm text-muted-foreground">Ainda não há plano alimentar. Inicie a prescrição pelo botão acima.</p>
                        : <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 break-words text-sm font-semibold">{plan.name}</p><Badge variant="outline">{statusLabels[status] || 'Em revisão'}</Badge></div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                <HubMetric label="Energia" value={number(plan.daily_calories)} detail="kcal/dia" />
                                <HubMetric label="Proteínas" value={number(plan.daily_protein)} detail="g/dia" />
                                <HubMetric label="Carboidratos" value={number(plan.daily_carbs)} detail="g/dia" />
                                <HubMetric label="Gorduras" value={number(plan.daily_fat)} detail="g/dia" />
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="text-xs leading-relaxed text-muted-foreground"><p>{startDate && isValid(startDate) ? `Início em ${format(startDate, 'dd/MM/yyyy')}` : 'Data de início não informada'}</p>{!canShare && <p>O envio exige um plano finalizado e vigente.</p>}</div>
                                <Button variant="outline" size="sm" disabled={!canShare} onClick={() => onOpenChat?.()} className="shrink-0 gap-2"><Send className="h-4 w-4" />Enviar ao paciente</Button>
                            </div>
                        </div>}
        </HubPanel>
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <EnergyExpenditureSummaryCard patientId={patientId} patient={patient} />
            <HubPanel title="Diário alimentar" description="Registros dos últimos 7 dias" action={<Button variant="outline" size="sm" onClick={() => navigate(patientRoute(patient, 'food-diary'))}>Abrir diário</Button>}>
                {diaryQuery.isLoading ? <div role="status" aria-label="Carregando diário alimentar"><CardSkeleton lines={3} /></div>
                    : diaryQuery.isError || adherence?.error || !adherence?.data ? <div className="flex flex-col items-start gap-3"><p className="text-sm">Não foi possível carregar a regularidade do diário.</p><Button variant="outline" size="sm" onClick={() => diaryQuery.refetch()}>Recarregar diário</Button></div>
                        : adherence.data.totalMeals === 0 ? <p className="text-sm text-muted-foreground">Nenhuma refeição registrada nos últimos 7 dias.</p>
                            : <div className="flex flex-col gap-3">
                                <div className="grid grid-cols-2 gap-2">
                                    <HubMetric label="Regularidade" value={`${number(adherence.data.adherencePercentage)}%`} detail="dias com registros" />
                                    <HubMetric label="Sequência" value={number(adherence.data.currentStreak)} detail="dias consecutivos" />
                                    <HubMetric label="Refeições" value={number(adherence.data.totalMeals)} detail="no período" />
                                    <HubMetric label="Média energética" value={summary?.error ? '—' : number(summary?.data?.avgCaloriesPerDay)} detail="kcal/dia registrado" />
                                </div>
                                <p className="text-xs leading-relaxed text-muted-foreground">A regularidade indica preenchimento do diário, não adesão à dieta prescrita.</p>
                                {summary?.error && <Button variant="outline" size="sm" onClick={() => diaryQuery.refetch()}>Recarregar média energética</Button>}
                            </div>}
            </HubPanel>
        </div>
    </div>;
}
