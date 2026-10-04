import React from 'react';
import { Info, Lightbulb, ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { workspaceInsights } from '@/lib/utils/mealPlanWorkspace';
import { roundedNutrition } from '@/lib/utils/mealPlanPresentation';

export default function NutritionInsights({ plan, referenceValues }) {
    const insights = workspaceInsights(plan, referenceValues);
    return <section aria-label="Insights e alertas" className="rounded-2xl border bg-white p-4 sm:p-5">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-normal"><Lightbulb aria-hidden="true" className="h-4 w-4 text-amber-700" />Insights e alertas</h3>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Comparações com as metas configuradas. Não representam avaliação clínica automática.</p>
        {!insights.length ? <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 [overflow-wrap:anywhere]">Configure os valores de referência na análise completa para comparar os macronutrientes.</span></p> : <ul className="mt-4 space-y-2">{insights.map(item => {
            const Icon = item.difference < 0 ? ArrowDown : item.difference > 0 ? ArrowUp : Minus;
            return <li key={item.key} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex items-center gap-2 font-semibold"><Icon aria-hidden="true" className="h-4 w-4 text-primary" />{item.label}</div><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{roundedNutrition(item.value)} {item.unit} no plano · meta de {roundedNutrition(item.target)} {item.unit}. {item.difference === 0 ? 'Mesmo valor da meta.' : `${roundedNutrition(Math.abs(item.difference))} ${item.unit} ${item.difference < 0 ? 'abaixo' : 'acima'} da meta configurada.`}</p></li>;
        })}</ul>}
    </section>;
}
