import React from 'react';
import { Flame, Target, Percent, Utensils, CalendarDays, CheckCircle2 } from 'lucide-react';
import { roundedNutrition } from '@/lib/utils/mealPlanPresentation';
import { energyComparison } from '@/lib/utils/mealPlanWorkspace';

export default function MealPlanOverview({ plan, target, formatDate, energyLoading=false, energyError=false }) {
    if (!plan) return null;
    const comparison = energyComparison(plan.daily_calories, target);
    const metrics = [
        { label: 'Status do plano', value: plan.is_draft ? 'Rascunho' : 'Plano ativo', hint: plan.start_date ? `Início em ${formatDate(plan.start_date)}` : 'Sem data definida', icon: CheckCircle2, tone: 'text-primary bg-primary/10' },
        { label: 'Energia do plano', value: `${roundedNutrition(plan.daily_calories)} kcal`, hint: 'Prescrição diária', icon: Flame, tone: 'text-orange-700 bg-orange-50' },
        { label: 'Meta energética', value: energyLoading ? 'Carregando…' : energyError ? 'Indisponível' : comparison ? `${roundedNutrition(target)} kcal` : 'Não definida', hint: 'Cálculo energético do paciente', icon: Target, tone: 'text-violet-700 bg-violet-50' },
        { label: 'Relação com a meta', value: comparison ? `${roundedNutrition(comparison.percentage)}%` : '—', hint: 'Energia prescrita / meta', icon: Percent, tone: 'text-blue-700 bg-blue-50' },
        { label: 'Refeições', value: plan.meals?.length || 0, hint: 'Organizadas no plano', icon: Utensils, tone: 'text-primary bg-primary/10' },
        { label: 'Última atualização', value: formatDate(plan.updated_at || plan.created_at) || '—', hint: 'Último registro salvo', icon: CalendarDays, tone: 'text-slate-600 bg-slate-100' },
    ];
    return <dl aria-label="Resumo do plano alimentar" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] gap-3 rounded-2xl border bg-white p-3 shadow-sm sm:grid-cols-3 sm:p-5 lg:grid-cols-6">
        {metrics.map(({ label, value, hint, icon: Icon, tone }) => <div key={label} className="min-w-0 [overflow-wrap:anywhere]">
            <dt className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon aria-hidden="true" className="h-4 w-4" /></span><span className="min-w-0 break-words">{label}</span></dt>
            <dd className="text-base font-bold tabular-nums text-foreground">{value}</dd><dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</dd>
        </div>)}
    </dl>;
}
