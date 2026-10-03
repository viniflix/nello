import React, { useState } from 'react';
import { Clock, ChevronDown, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatQuantityWithUnit } from '@/lib/utils/measureTranslations';
import { displayNumber, roundedNutrition, mealColors } from '@/lib/utils/mealPlanPresentation';

export default function PlanMealsOverview({ meals = [], dailyCalories = 0 }) {
    const [allOpen, setAllOpen] = useState(false);
    return <section aria-label="Refeições do plano" className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="flex items-center gap-2 font-semibold"><UtensilsCrossed className="h-4 w-4 text-primary" />Refeições</h3><p className="mt-1 text-sm text-muted-foreground">Abra uma refeição para conferir alimentos, porções e opções.</p></div>
            {meals.length > 0 && <Button variant="ghost" size="sm" onClick={() => setAllOpen(value => !value)}>{allOpen ? 'Recolher refeições' : 'Expandir refeições'}</Button>}
        </div>
        {!meals.length && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma refeição cadastrada neste plano.</p>}
        {meals.map((meal, index) => {
            const included = meal.include_in_totals !== false;
            const percentage = included && displayNumber(dailyCalories) > 0 ? displayNumber(meal.total_calories) / dailyCalories * 100 : null;
            return <details key={meal.id || index} open={allOpen} className="group overflow-hidden rounded-xl border border-l-4 bg-white" style={{ borderLeftColor: mealColors[index % mealColors.length] }}>
                <summary className="flex cursor-pointer list-none items-start gap-3 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                    <span className="mt-0.5 text-sm font-semibold text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1"><span className="block break-words font-semibold">{meal.name || 'Refeição'}</span><span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">{meal.meal_time && <span className="inline-flex items-center gap-1"><Clock aria-hidden="true" className="h-3.5 w-3.5" />{meal.meal_time.slice(0, 5)}</span>}<span>{meal.foods?.length || 0} {(meal.foods?.length || 0) === 1 ? 'alimento' : 'alimentos'}</span></span>{!included && <span className="mt-2 inline-block rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">Opção alternativa · fora dos totais</span>}</span>
                    <span className="shrink-0 text-right"><span className="block text-sm font-semibold tabular-nums">{roundedNutrition(meal.total_calories)} kcal</span>{percentage !== null && <span className="text-xs text-muted-foreground">{roundedNutrition(percentage)}% do dia</span>}<ChevronDown aria-hidden="true" className="ml-auto mt-2 h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" /></span>
                </summary>
                <div className="border-t px-4 pb-4">
                    {meal.notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-blue-50 p-3 text-sm text-blue-900">{meal.notes}</p>}
                    {!meal.foods?.length ? <p className="pt-3 text-sm text-muted-foreground">Nenhum alimento nesta refeição.</p> : <ul className="divide-y">{meal.foods.map((food, foodIndex) => <li key={food.id || foodIndex} className="py-3">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 text-sm"><span className="min-w-0 flex-1 basis-40 break-words font-medium">{food.patient_description || food.food?.name || food.foods?.name || 'Alimento'}</span><span className="text-primary">{formatQuantityWithUnit(food.quantity ?? 0, food.unit || 'gram', food.measure || food.measure_snapshot)}</span></div>
                        {food.notes && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{food.notes}</p>}
                        {!!food.substitutes?.length && <div className="mt-2 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-950"><p className="font-medium">Ou substitua por uma destas opções:</p><ul className="mt-1 space-y-1">{food.substitutes.map((substitute, subIndex) => <li key={substitute.id || subIndex} className="break-words">{substitute.name || substitute.food?.name || substitute.foods?.name || 'Alimento'} · {formatQuantityWithUnit(substitute.quantity ?? 0, substitute.unit || 'gram', substitute.measure || substitute.measure_snapshot)}</li>)}</ul></div>}
                    </li>)}</ul>}
                </div>
            </details>;
        })}
    </section>;
}
