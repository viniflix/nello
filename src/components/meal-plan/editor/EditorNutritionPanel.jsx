import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import MacrosChart from '../MacrosChart';
import PlanTargetMonitor from '../PlanTargetMonitor';
import NutritionInsights from '../NutritionInsights';
import { planEnergyTarget } from '@/lib/utils/mealPlanWorkspace';
export default function EditorNutritionPanel({ totals, meals, name, patientId, patientSlugOrId, planId, referenceValues, onReferenceUpdate, energyCalculation, energyLoading, energyError, onRetry, preview }) {
    const missing = meals.filter(meal => !meal.foods?.length).length;
    return <aside aria-label="Análise da edição" className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto xl:self-start xl:pr-1">
        {preview && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">Prévia da refeição em edição. Confirme a refeição para incluir essas mudanças no plano.</p>}
        <MacrosChart editor {...{ patientId, patientSlugOrId, planId, onReferenceUpdate }} title="Resumo nutricional" protein={totals.daily_protein} carbs={totals.daily_carbs} fat={totals.daily_fat} calories={totals.daily_calories} compact plan={{ meals }} />
        {energyLoading ? <div role="status" className="rounded-2xl border bg-white p-4 text-sm text-muted-foreground">Carregando a meta energética…</div> : energyError ? <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Não foi possível carregar a meta energética.<Button type="button" variant="outline" size="sm" onClick={onRetry}>Tentar novamente</Button></div> : <PlanTargetMonitor compact currentCalories={totals.daily_calories} targetCalories={planEnergyTarget(energyCalculation)} {...{ patientId, patientSlugOrId, energyCalculation }} />}
        <section aria-label="Pendências do plano" className="rounded-2xl border bg-white p-4"><h3 className="flex items-center gap-2 text-base font-semibold tracking-normal"><AlertTriangle aria-hidden="true" className="h-5 w-5 text-orange-600" />Pendências do plano</h3><ul className="mt-3 divide-y text-sm">{[{ ok: Boolean(name.trim()), text: name.trim() ? 'Nome do plano preenchido' : 'Defina um nome para o plano' }, { ok: meals.length > 0, text: meals.length ? `${meals.length} refeições cadastradas` : 'Adicione a primeira refeição' }, { ok: meals.length > 0 && missing === 0, text: missing ? `${missing} refeições ainda sem alimentos` : meals.length ? 'Todas as refeições têm alimentos' : 'Os alimentos entram nas refeições' }].map(item => <li key={item.text} className="flex items-start gap-2 py-3">{item.ok ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}<span>{item.text}</span></li>)}</ul></section>
        <NutritionInsights plan={totals} referenceValues={referenceValues} />

    </aside>;
}
