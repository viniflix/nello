import { VisibleChart } from '@/components/ui/visible-chart';
import { logDiagnostic } from '@/infrastructure/observability/safeLogger';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useResolvedPatientId } from '@/hooks/useResolvedPatientId';
import { patientRoute } from '@/lib/utils/patientRoutes';
import { ArrowLeft, Settings, Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';
import ReferenceValuesModal from '@/components/meal-plan/ReferenceValuesModal';
import { MicronutrientsCard } from '@/components/meal-plan/MicronutrientsCard';
import PlanNutritionTotals, { nutrientStyles } from '@/components/meal-plan/PlanNutritionTotals';
import { getMealPlanById, getReferenceValues, deleteReferenceValues } from '@/lib/supabase/meal-plan-queries';
import { displayNumber, roundedNutrition, referenceTargets, targetComparison, mealColors } from '@/lib/utils/mealPlanPresentation';
import { useToast } from '@/components/ui/use-toast';
import { toPortugueseError } from '@/lib/utils/errorMessages';

export default function MealPlanSummaryPage() {
    const { patientId, paramValue } = useResolvedPatientId();
    const { planId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [loadedData, setData] = useState({ plan: null, reference: null, loading: true, error: false, referenceError: false });
    const [revision, setRevision] = useState(0);
    const [showRefModal, setShowRefModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const scope = `${patientId}:${planId}`;
    const data = loadedData.scope === scope ? loadedData : {plan:null,reference:null,loading:true,error:false,referenceError:false};
    useEffect(() => {
        let active = true;
        setData({ scope, plan: null, reference: null, loading: true, error: false, referenceError: false });
        if (!patientId || !planId) return () => { active = false; };
        void Promise.all([getMealPlanById(planId), getReferenceValues(planId)]).then(([planResult, refResult]) => {
            if (!active) return;
            if (planResult.error) throw planResult.error;
            if (planResult.data?.patient_id && planResult.data.patient_id !== patientId) throw new Error('Plan scope mismatch');
            setData({ scope, plan: planResult.data, reference: refResult.error ? null : refResult.data, loading: false, error: false, referenceError: Boolean(refResult.error) });
        }).catch(error => {
            if (!active) return;
            logDiagnostic('error', 'MealPlanSummaryPage:load', 'Falha ao carregar análise', error?.code || 'unknown');
            setData({ scope, plan: null, reference: null, loading: false, error: true, referenceError: false });
        });
        return () => { active = false; };
    }, [patientId, planId, revision, scope]);
    const back = () => navigate(patientRoute({ id: patientId, slug: paramValue }, 'meal-plan'));
    const removeReference = async () => {
        if (!window.confirm('Excluir as metas deste plano? Os alimentos e o plano serão mantidos.')) return;
        setDeleting(true);
        try {
            const result = await deleteReferenceValues(planId);
            if (result.error) throw result.error;
            toast({ title: 'Metas excluídas', description: 'O plano alimentar foi mantido.' });
            setRevision(value => value + 1);
        } catch (error) { toast({ title: 'Não foi possível excluir as metas', description: toPortugueseError(error), variant: 'destructive' }); }
        finally { setDeleting(false); }
    };
    const { plan, reference, loading, error, referenceError } = data;
    const targets = referenceTargets(reference);
    const distribution = (plan?.meals || []).filter(meal => meal.include_in_totals !== false && displayNumber(meal.total_calories) > 0).map((meal, index) => ({ name: meal.name, value: displayNumber(meal.total_calories), color: mealColors[index % mealColors.length] }));
    const chartTotal = distribution.reduce((sum, meal) => sum + meal.value, 0);
    return <div className="mx-auto max-w-6xl space-y-5 p-[16px] sm:p-6 [overflow-wrap:anywhere] [&_button]:max-w-full [&_button]:h-auto [&_button]:whitespace-normal [&_button]:[overflow-wrap:anywhere]">
        <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={back} className="gap-2"><ArrowLeft className="h-4 w-4" />Voltar aos planos</Button>{plan && <Button onClick={() => setShowRefModal(true)} className="gap-2"><Settings className="h-4 w-4" />Configurar metas</Button>}</div>
        <header><p className="text-sm font-medium text-primary">Análise do plano alimentar</p><h1 className="mt-1 break-words text-2xl font-bold">Resumo nutricional</h1><p className="mt-1 break-words text-muted-foreground">{plan?.name || 'Energia, nutrientes e comparação com as metas do plano.'}</p></header>
        {loading ? <p role="status" className="rounded-xl border bg-white p-8 text-center">Carregando análise nutricional…</p> : !plan ? <div role="alert" className="rounded-xl border bg-white p-6"><p>{error ? 'Não foi possível carregar a análise. Tente novamente.' : 'Este plano não está disponível.'}</p><Button variant="outline" className="mt-3 gap-2" onClick={() => setRevision(value => value + 1)}><RefreshCw className="h-4 w-4" />Tentar novamente</Button></div> : <>
            <PlanNutritionTotals plan={plan} />
            <p className="text-sm text-muted-foreground">Totais do dia consideram apenas as refeições incluídas na análise. Opções alternativas permanecem no plano.</p>
            <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                <Card className="min-w-0 bg-white"><CardHeader className="p-[12px] sm:p-6"><CardTitle className="tracking-normal text-lg">Energia por refeição</CardTitle></CardHeader><CardContent className="p-[12px] pt-0 sm:p-6 sm:pt-0">
                    {distribution.length ? <><div aria-hidden="true"><VisibleChart width="100%" height={230}><PieChart accessibilityLayer={false} tabIndex={-1}><Pie rootTabIndex={-1} data={distribution} dataKey="value" innerRadius={62} outerRadius={88} paddingAngle={2} isAnimationActive={false}>{distribution.map((meal, index) => <Cell key={index} fill={meal.color} />)}</Pie><Tooltip formatter={value => `${roundedNutrition(value)} kcal`} /></PieChart></VisibleChart></div><ul aria-label="Distribuição de energia por refeição" className="space-y-2">{distribution.map((meal, index) => <li key={index} className="flex flex-wrap items-start justify-between gap-3 text-sm"><span className="min-w-0 inline-flex flex-[1_1_10rem] items-start gap-2 break-words"><span aria-hidden="true" className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meal.color }} />{meal.name}</span><span className="ml-auto min-w-0 tabular-nums">{roundedNutrition(meal.value)} kcal · {roundedNutrition(meal.value / chartTotal * 100)}%</span></li>)}</ul></> : <p className="py-8 text-center text-sm text-muted-foreground">Não há energia quantificada nas refeições incluídas.</p>}
                </CardContent></Card>
                <Card className="min-w-0 bg-white"><CardHeader className="p-[12px] sm:p-6"><CardTitle className="tracking-normal text-lg">Plano e metas</CardTitle></CardHeader><CardContent className="space-y-3 p-[12px] pt-0 sm:p-6 sm:pt-0">
                    {targets ? <><p className="text-sm text-muted-foreground">Compare a prescrição com as metas que você definiu. Faixa de referência: 95% a 105%.</p>{nutrientStyles.map(item => {
                        const comparison = targetComparison(plan[`daily_${item.key}`], targets[item.key]);
                        return <div key={item.key} className="rounded-xl border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{item.label}</h3><span className={`rounded px-2 py-1 text-xs font-medium ${comparison.className}`}>{comparison.label}</span></div><p className="mt-2 text-sm">Prescrito: <strong>{roundedNutrition(plan[`daily_${item.key}`])} {item.unit}</strong> · Meta: {targets[item.key] > 0 ? `${roundedNutrition(targets[item.key])} ${item.unit}` : 'não definida'}</p>{comparison.percentage !== null && <p className="mt-1 text-xs text-muted-foreground">{roundedNutrition(comparison.percentage)}% da meta</p>}</div>;
                    })}<Button variant="ghost" disabled={deleting} className="gap-2 text-destructive" onClick={removeReference}><Trash2 className="h-4 w-4" />{deleting ? 'Excluindo…' : 'Excluir metas'}</Button></> : <div className="rounded-xl border border-blue-200 bg-blue-50 p-[12px]"><p className="text-sm text-blue-950">{referenceError ? 'As metas não puderam ser carregadas. Os totais do plano continuam disponíveis.' : 'Defina metas para comparar energia e macronutrientes.'}</p><Button variant="outline" className="mt-3" onClick={() => referenceError ? setRevision(value => value + 1) : setShowRefModal(true)}>{referenceError ? 'Tentar carregar metas' : 'Configurar metas'}</Button></div>}
                </CardContent></Card>
            </div>
            <Card className="bg-white"><CardHeader className="p-[12px] sm:p-6"><CardTitle className="tracking-normal text-lg">Nutrientes por refeição</CardTitle></CardHeader><CardContent className="p-[12px] pt-0 sm:p-6 sm:pt-0"><div role="region" aria-label="Tabela de nutrientes por refeição" tabIndex={0} className="overflow-x-auto rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><table className="w-full min-w-[40rem] text-sm"><caption className="sr-only">Refeições e seus nutrientes. Alternativas não entram no total diário.</caption><thead className="bg-slate-50"><tr>{['Refeição', 'Horário', 'Energia (kcal)', 'Proteínas (g)', 'Carboidratos (g)', 'Gorduras (g)'].map(label => <th key={label} scope="col" className="whitespace-nowrap p-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{(plan.meals || []).map((meal, index) => <tr key={meal.id || index} className="border-t"><th scope="row" className="p-3 text-left font-medium">{meal.name}{meal.include_in_totals === false && <span className="block text-xs text-muted-foreground">Alternativa · fora dos totais</span>}</th><td className="p-3">{meal.meal_time?.slice(0, 5) || '—'}</td>{nutrientStyles.map(item => <td key={item.key} className="p-3 tabular-nums">{roundedNutrition(meal[`total_${item.key}`])}</td>)}</tr>)}</tbody><tfoot className="border-t bg-primary/5 font-semibold"><tr><th scope="row" colSpan={2} className="p-3 text-left">Total diário</th>{nutrientStyles.map(item => <td key={item.key} className="p-3 tabular-nums">{roundedNutrition(plan[`daily_${item.key}`])}</td>)}</tr></tfoot></table></div></CardContent></Card>
            <MicronutrientsCard plan={plan} />
            <ReferenceValuesModal isOpen={showRefModal} onClose={() => { setShowRefModal(false); setRevision(value => value + 1); }} planId={planId} />
        </>}
    </div>;
}
