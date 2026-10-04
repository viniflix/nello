import React from 'react';
import { roundedNutrition } from '@/lib/utils/mealPlanPresentation';
import { macroDistribution } from '@/lib/utils/mealPlanWorkspace';
import { summarizeMicronutrients } from '@/lib/utils/micronutrientCoverage';
import { Zap, Dumbbell, Wheat, Droplet, Leaf } from 'lucide-react';

export const nutrientStyles = [
    { key: 'calories', label: 'Energia', unit: 'kcal', classes: 'border-green-200 bg-green-50 text-green-900' },
    { key: 'protein', label: 'Proteínas', unit: 'g', classes: 'border-violet-200 bg-violet-50 text-violet-900' },
    { key: 'carbs', label: 'Carboidratos', unit: 'g', classes: 'border-blue-200 bg-blue-50 text-blue-900' },
    { key: 'fat', label: 'Gorduras', unit: 'g', classes: 'border-orange-200 bg-orange-50 text-orange-900' },
];
export default function PlanNutritionTotals({ plan }) {
    const distribution = macroDistribution({ protein: plan?.daily_protein, carbs: plan?.daily_carbs, fat: plan?.daily_fat });
    const fiber = summarizeMicronutrients(plan, ['fiber']).fiber;
    const icons = {calories: Zap, protein: Dumbbell, carbs: Wheat, fat: Droplet, fiber: Leaf};
    const items = [...nutrientStyles, {key:'fiber',label:'Fibras',unit:'g',classes:'border-amber-200 bg-amber-50 text-amber-900'}];
    return <dl aria-label="Totais diários do plano" className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 6.5rem), 1fr))' }}>
        {items.map(item => { const Icon=icons[item.key]; return <div key={item.key} className={`min-w-0 rounded-xl border p-3 ${item.classes}`}>
            <dt className="flex flex-wrap items-center gap-1 text-xs font-medium sm:gap-2"><Icon aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 basis-full [overflow-wrap:anywhere] sm:basis-auto">{item.label}</span></dt>
            <dd className="mt-2 text-lg font-bold tabular-nums">{item.key === 'fiber' ? (fiber.known ? `${fiber.unknown ? '≥ ' : ''}${roundedNutrition(fiber.value)} g` : 'Não informado') : <>{roundedNutrition(plan?.[`daily_${item.key}`])} <span className="text-xs font-medium">{item.unit}</span></>}</dd>
            {['protein','carbs','fat'].includes(item.key) && <dd className="mt-1 text-xs">{roundedNutrition(distribution[item.key])}% da energia dos macros</dd>}
            {item.key === 'fiber' && fiber.unknown > 0 && <dd className="mt-1 text-xs">Dados do catálogo incompletos</dd>}
        </div>; })}
    </dl>;
}
